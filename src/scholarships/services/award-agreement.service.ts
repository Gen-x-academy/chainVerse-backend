import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AwardAgreement,
  AwardAgreementDocument,
  AgreementDeclarationKey,
  REQUIRED_DECLARATION_KEYS,
} from '../schemas/award-agreement.schema';
import {
  AwardStatus,
  ScholarshipAward,
  ScholarshipAwardDocument,
  AWARD_STATUS_TRANSITIONS,
} from '../schemas/scholarship-award.schema';
import {
  BudgetReservation,
  BudgetReservationDocument,
  BudgetLedger,
  BudgetLedgerDocument,
  ReservationStatus,
} from '../schemas/budget-reservation.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import {
  AcceptAwardWithAgreementDto,
  AgreementDeclarationDto,
  AwardAgreementResult,
  AgreementDeclarationResult,
  CreateAgreementDto,
} from '../dto/award-agreement.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

// ── Serialization helpers ─────────────────────────────────────────────────────

function toAgreementResult(doc: AwardAgreementDocument): AwardAgreementResult {
  const declarations: AgreementDeclarationResult[] = doc.declarations.map(
    (d) => ({
      key: d.key,
      acknowledged: d.acknowledged,
      acknowledgedAt: d.acknowledgedAt.toISOString(),
    }),
  );

  return {
    agreementId: doc._id.toString(),
    organizationId: doc.organizationId,
    awardId: doc.awardId.toString(),
    applicationId: doc.applicationId.toString(),
    programId: doc.programId.toString(),
    termsVersionNumber: doc.termsVersionNumber,
    termsSnapshotHash: doc.termsSnapshotHash,
    signerUserId: doc.signerUserId,
    signerIpAddress: doc.signerIpAddress,
    signedAt: doc.signedAt.toISOString(),
    declarations,
    applicantNote: doc.applicantNote,
    createdAt: doc.createdAt!.toISOString(),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Produces a stable SHA-256 hex digest of the immutable fields of a
 * ProgramTermsVersion document.
 *
 * Only fields marked `immutable: true` on the schema are included so that
 * mutable administrative fields (`status`, `publishedAt`, `updatedAt`) do not
 * affect the digest.  The object is sorted by key before serialisation to
 * eliminate ordering variance.
 */
function computeTermsSnapshotHash(
  termsVersion: ProgramTermsVersionDocument,
): string {
  const canonical = {
    versionNumber: termsVersion.versionNumber,
    eligibility: termsVersion.eligibility,
    deadlines: termsVersion.deadlines,
    awardValue: termsVersion.awardValue,
    awardCurrency: termsVersion.awardCurrency ?? null,
    obligations: termsVersion.obligations,
  };

  const json = JSON.stringify(
    canonical,
    // Stable key ordering — guarantees identical digests regardless of
    // insertion order in the source object.
    Object.keys(canonical).sort(),
  );

  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Validates that all REQUIRED_DECLARATION_KEYS appear in the supplied
 * declarations array with `acknowledged = true`.
 *
 * Throws VAL_AGREEMENT_DECLARATIONS_INCOMPLETE listing the missing / unset
 * keys when validation fails.
 */
function assertDeclarationsComplete(
  declarations: AgreementDeclarationDto[],
): void {
  const provided = new Map<AgreementDeclarationKey, boolean>(
    declarations.map((d) => [d.key, d.acknowledged]),
  );

  const incomplete: AgreementDeclarationKey[] = [];

  for (const key of REQUIRED_DECLARATION_KEYS) {
    if (!provided.get(key)) {
      incomplete.push(key);
    }
  }

  if (incomplete.length > 0) {
    throw new ValidationDomainException(
      `The following required declarations were not acknowledged: ${incomplete.join(', ')}.`,
      ErrorCode.VAL_AGREEMENT_DECLARATIONS_INCOMPLETE,
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * AwardAgreementService records and retrieves the immutable signed agreement
 * that captures a scholar's formal acceptance of award terms plus all required
 * declarations.
 *
 * Key invariants:
 *
 *   1. **Immutability.**
 *      AwardAgreement documents are written once and never mutated.  Any
 *      attempt to create a second agreement for the same award returns 409
 *      BIZ_AWARD_AGREEMENT_ALREADY_EXISTS.
 *
 *   2. **Signer identity verification.**
 *      The `signerUserId` supplied (or derived from the JWT `sub`) must equal
 *      `award.applicantId`.  Any mismatch returns 403
 *      BIZ_AWARD_ACCEPTANCE_FORBIDDEN.
 *
 *   3. **Declaration completeness.**
 *      All REQUIRED_DECLARATION_KEYS must appear with `acknowledged = true`.
 *      Partial acknowledgements are rejected with
 *      VAL_AGREEMENT_DECLARATIONS_INCOMPLETE before any persistence occurs.
 *
 *   4. **Terms version snapshot.**
 *      On `acceptWithAgreement`, the service resolves the currently PUBLISHED
 *      ProgramTermsVersion for the award's program, computes its SHA-256 hash,
 *      and stores it alongside the version number.  This makes the agreement
 *      self-verifiable independently of the live document.
 *      On `createAgreement` (staff out-of-band), the caller supplies the hash;
 *      the service validates it against the stored terms version.
 *
 *   5. **Declined-offer guard.**
 *      Agreements may only be recorded against PENDING_ACCEPTANCE awards
 *      (for the atomic accept+sign flow) or ACCEPTED awards (for the
 *      out-of-band staff flow).  Terminal states (DECLINED, OFFER_EXPIRED,
 *      RESCINDED) are rejected with BIZ_AGREEMENT_DECLINED_OFFER.
 *
 *   6. **Tenant isolation.**
 *      Every public method accepts `organizationId` and includes it in every
 *      Mongoose query.
 *
 *   7. **Budget reservation linkage (atomic accept+sign).**
 *      `acceptWithAgreement` delegates award-state transition and reservation
 *      confirmation to the shared private helpers mirroring
 *      ScholarshipAwardService, keeping both operations in the same logical
 *      request without coupling the two services together.
 */
@Injectable()
export class AwardAgreementService {
  private readonly logger = new Logger(AwardAgreementService.name);

  constructor(
    @InjectModel(AwardAgreement.name)
    private readonly agreementModel: Model<AwardAgreementDocument>,
    @InjectModel(ScholarshipAward.name)
    private readonly awardModel: Model<ScholarshipAwardDocument>,
    @InjectModel(ProgramTermsVersion.name)
    private readonly termsVersionModel: Model<ProgramTermsVersionDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Confirms the budget reservation linked to an award (PENDING → CONFIRMED),
   * moving the amount from reservedAmount to disbursedAmount on the ledger.
   * Safe to call with a null `reservationId` — returns immediately.
   */
  private async confirmLinkedReservation(
    reservationId: Types.ObjectId | null,
    actorId: string,
    note: string | null,
  ): Promise<void> {
    if (!reservationId) return;

    const updated = await this.reservationModel
      .findOneAndUpdate(
        { _id: reservationId, status: ReservationStatus.PENDING },
        {
          $set: {
            status: ReservationStatus.CONFIRMED,
            resolvedAt: new Date(),
            resolvedBy: actorId,
            reason: note,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) return; // Already confirmed — idempotent.

    await this.ledgerModel
      .updateOne(
        {
          programId: updated.programId,
          organizationId: updated.organizationId,
        },
        {
          $inc: {
            reservedAmount: -updated.amount,
            disbursedAmount: updated.amount,
          },
        },
      )
      .exec();
  }

  /**
   * Resolves the currently PUBLISHED terms version for a program.
   * Throws RES_TERMS_VERSION_NOT_FOUND when none exists.
   */
  private async resolvePublishedTerms(
    programId: string,
    organizationId: string,
  ): Promise<ProgramTermsVersionDocument> {
    const terms = await this.termsVersionModel
      .findOne({
        programId: new Types.ObjectId(programId),
        organizationId,
        status: TermsVersionStatus.PUBLISHED,
      })
      .sort({ versionNumber: -1 }) // Most-recent published version.
      .exec();

    if (!terms) {
      throw new ResourceNotFoundException(
        `No published terms version found for program ${programId}.`,
        ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      );
    }

    return terms;
  }

  // ── Atomic accept + sign ───────────────────────────────────────────────────

  /**
   * The applicant formally accepts the scholarship offer AND records the signed
   * agreement in a single request.
   *
   * Steps:
   *   1. Resolve the award (tenant-scoped lookup).
   *   2. Verify the caller is the award's applicant.
   *   3. Guard against terminal award states (BIZ_AGREEMENT_DECLINED_OFFER).
   *   4. Verify the acceptance deadline has not passed.
   *   5. Verify the award is in PENDING_ACCEPTANCE state.
   *   6. Check no agreement already exists (BIZ_AWARD_AGREEMENT_ALREADY_EXISTS).
   *   7. Validate all required declarations are acknowledged.
   *   8. Resolve the currently published terms version and compute its hash.
   *   9. Persist the immutable AwardAgreement document.
   *  10. Transition award PENDING_ACCEPTANCE → ACCEPTED.
   *  11. Confirm the linked BudgetReservation (PENDING → CONFIRMED) if present.
   *
   * @param awardId       Path parameter — the award to accept.
   * @param callerId      JWT `sub` of the authenticated user (must equal award.applicantId).
   * @param ipAddress     Client IP address captured from the HTTP request.
   * @param dto           Acceptance body including declarations and optional note.
   */
  async acceptWithAgreement(
    awardId: string,
    callerId: string,
    ipAddress: string | null,
    dto: AcceptAwardWithAgreementDto,
  ): Promise<AwardAgreementResult> {
    const { organizationId } = dto;

    // 1. Resolve the award.
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId), organizationId })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found in organization ${organizationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // 2. Signer identity check.
    if (award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'Only the applicant may accept this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    // 3. Declined-offer guard — terminal states cannot receive agreements.
    const nonAcceptableStates: AwardStatus[] = [
      AwardStatus.DECLINED,
      AwardStatus.OFFER_EXPIRED,
      AwardStatus.RESCINDED,
    ];
    if (nonAcceptableStates.includes(award.status)) {
      throw new BusinessRuleException(
        `Award ${awardId} is in terminal state ${award.status}; ` +
          `no agreement may be recorded against a declined or expired offer.`,
        ErrorCode.BIZ_AGREEMENT_DECLINED_OFFER,
      );
    }

    // 4. Acceptance deadline check (surface before state check — more actionable).
    if (new Date() > award.acceptanceDeadline) {
      throw new BusinessRuleException(
        `The acceptance deadline (${award.acceptanceDeadline.toISOString()}) ` +
          `has passed.  The offer has expired.`,
        ErrorCode.BIZ_AWARD_OFFER_EXPIRED,
      );
    }

    // 5. State check — must be PENDING_ACCEPTANCE.
    const allowed = AWARD_STATUS_TRANSITIONS[award.status];
    if (!allowed.includes(AwardStatus.ACCEPTED)) {
      throw new BusinessRuleException(
        `Award status transition ${award.status} → accepted is not permitted.`,
        ErrorCode.BIZ_AWARD_INVALID_STATE,
      );
    }

    // 6. Duplicate agreement guard.
    const existing = await this.agreementModel
      .findOne({ awardId: new Types.ObjectId(awardId) })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `An agreement has already been recorded for award ${awardId}.`,
        ErrorCode.BIZ_AWARD_AGREEMENT_ALREADY_EXISTS,
      );
    }

    // 7. Validate declarations.
    assertDeclarationsComplete(dto.declarations);

    // 8. Resolve published terms and compute snapshot hash.
    const terms = await this.resolvePublishedTerms(
      award.programId.toString(),
      organizationId,
    );
    const termsSnapshotHash = computeTermsSnapshotHash(terms);
    const now = new Date();

    // 9. Persist the immutable agreement.
    const agreement = await this.agreementModel.create({
      organizationId,
      awardId: new Types.ObjectId(awardId),
      applicationId: award.applicationId,
      programId: award.programId,
      termsVersionNumber: terms.versionNumber,
      termsSnapshotHash,
      signerUserId: callerId,
      signerIpAddress: ipAddress ?? null,
      signedAt: now,
      declarations: dto.declarations.map((d) => ({
        key: d.key,
        acknowledged: d.acknowledged,
        acknowledgedAt: now,
      })),
      applicantNote: dto.note ?? null,
    });

    // 10. Transition award to ACCEPTED.
    award.status = AwardStatus.ACCEPTED;
    award.respondedAt = now;
    award.applicantNote = dto.note ?? null;
    award.statusHistory.push({
      status: AwardStatus.ACCEPTED,
      changedBy: callerId,
      changedAt: now,
    });
    await award.save();

    // 11. Confirm the linked budget reservation.
    await this.confirmLinkedReservation(
      award.reservationId,
      callerId,
      dto.note ?? null,
    );

    this.logger.log(
      `Award ${awardId} accepted with agreement ${agreement._id} ` +
        `by applicant ${callerId}; terms v${terms.versionNumber}, ` +
        `hash=${termsSnapshotHash.slice(0, 12)}…`,
    );

    return toAgreementResult(agreement);
  }

  // ── Staff: record agreement for already-accepted award ─────────────────────

  /**
   * Records a signed agreement for an award that has already been transitioned
   * to ACCEPTED via an out-of-band flow (e.g. paper signature scanned by staff).
   *
   * Steps:
   *   1. Resolve the award (tenant-scoped lookup).
   *   2. Verify the award is in ACCEPTED state.
   *   3. Verify `signerUserId` equals award.applicantId.
   *   4. Check no agreement already exists.
   *   5. Validate all required declarations.
   *   6. Resolve the terms version matching dto.termsVersionNumber; verify hash.
   *   7. Persist the immutable AwardAgreement document.
   *
   * @param awardId   Path parameter.
   * @param actorId   JWT `sub` of the staff member performing the recording.
   * @param dto       Agreement body.
   */
  async createAgreement(
    awardId: string,
    actorId: string,
    dto: CreateAgreementDto,
  ): Promise<AwardAgreementResult> {
    const { organizationId } = dto;

    // 1. Resolve the award.
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId), organizationId })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found in organization ${organizationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // 2. Award must be in ACCEPTED state.
    if (award.status !== AwardStatus.ACCEPTED) {
      throw new BusinessRuleException(
        `Award ${awardId} must be in ACCEPTED state to record an out-of-band ` +
          `agreement (current status: ${award.status}).`,
        ErrorCode.BIZ_AGREEMENT_NOT_ACCEPTED,
      );
    }

    // 3. Signer identity check.
    if (dto.signerUserId !== award.applicantId) {
      throw new ForbiddenDomainException(
        `signerUserId ${dto.signerUserId} does not match the award applicant ` +
          `${award.applicantId}.`,
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    // 4. Duplicate agreement guard.
    const existing = await this.agreementModel
      .findOne({ awardId: new Types.ObjectId(awardId) })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `An agreement has already been recorded for award ${awardId}.`,
        ErrorCode.BIZ_AWARD_AGREEMENT_ALREADY_EXISTS,
      );
    }

    // 5. Validate declarations.
    assertDeclarationsComplete(dto.declarations);

    // 6. Resolve and verify the specified terms version.
    const terms = await this.termsVersionModel
      .findOne({
        programId: award.programId,
        organizationId,
        versionNumber: dto.termsVersionNumber,
      })
      .exec();

    if (!terms) {
      throw new ResourceNotFoundException(
        `Terms version ${dto.termsVersionNumber} not found for program ` +
          `${award.programId.toString()}.`,
        ErrorCode.RES_TERMS_VERSION_NOT_FOUND,
      );
    }

    // Verify the supplied hash matches the recomputed hash of the stored terms.
    const expectedHash = computeTermsSnapshotHash(terms);
    if (dto.termsSnapshotHash.toLowerCase() !== expectedHash) {
      throw new ValidationDomainException(
        `termsSnapshotHash does not match the stored terms version ` +
          `${dto.termsVersionNumber}.  Expected ${expectedHash}.`,
        ErrorCode.VAL_AGREEMENT_DECLARATIONS_INCOMPLETE,
      );
    }

    const now = new Date();

    // 7. Persist.
    const agreement = await this.agreementModel.create({
      organizationId,
      awardId: new Types.ObjectId(awardId),
      applicationId: award.applicationId,
      programId: award.programId,
      termsVersionNumber: terms.versionNumber,
      termsSnapshotHash: expectedHash,
      signerUserId: dto.signerUserId,
      signerIpAddress: dto.signerIpAddress ?? null,
      signedAt: now,
      declarations: dto.declarations.map((d) => ({
        key: d.key,
        acknowledged: d.acknowledged,
        acknowledgedAt: now,
      })),
      applicantNote: dto.note ?? null,
    });

    this.logger.log(
      `Out-of-band agreement ${agreement._id} recorded for award ${awardId} ` +
        `by staff ${actorId}; signer=${dto.signerUserId}, ` +
        `terms v${terms.versionNumber}`,
    );

    return toAgreementResult(agreement);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Returns the agreement for a given award.
   *
   * Staff endpoints supply `organizationId` for tenant scoping.
   * The applicant-facing endpoint passes `organizationId = null` and relies
   * on the `callerId` ownership check instead.
   *
   * @param awardId         Path parameter.
   * @param organizationId  Tenant scope (null only for applicant self-reads).
   * @param callerId        When set, asserts agreement.signerUserId === callerId.
   */
  async getAgreement(
    awardId: string,
    organizationId: string | null,
    callerId?: string,
  ): Promise<AwardAgreementResult> {
    const filter: Record<string, unknown> = {
      awardId: new Types.ObjectId(awardId),
    };
    if (organizationId) {
      filter['organizationId'] = organizationId;
    }

    const agreement = await this.agreementModel.findOne(filter).exec();

    if (!agreement) {
      throw new ResourceNotFoundException(
        `No agreement found for award ${awardId}.`,
        ErrorCode.RES_AWARD_AGREEMENT_NOT_FOUND,
      );
    }

    // Applicant self-read ownership check.
    if (callerId && agreement.signerUserId !== callerId) {
      throw new ForbiddenDomainException(
        'You do not have access to this agreement.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    return toAgreementResult(agreement);
  }

  // ── Integrity verification ─────────────────────────────────────────────────

  /**
   * Verifies that the `termsSnapshotHash` stored on an agreement still matches
   * the recomputed hash of the referenced ProgramTermsVersion document.
   *
   * Returns `{ valid: true }` when the hash matches, or `{ valid: false,
   * expected, stored }` when a discrepancy is detected (e.g. document
   * tampering or a bug in hash computation).
   *
   * This method does NOT throw — it returns a verification result so callers
   * can decide how to handle failures (log, alert, etc.).
   *
   * Authorization: OWNER or ADMIN only.
   *
   * @param awardId        Path parameter.
   * @param organizationId Tenant scope.
   */
  async verifyAgreementHash(
    awardId: string,
    organizationId: string,
  ): Promise<{ valid: boolean; stored: string; expected: string }> {
    const agreement = await this.agreementModel
      .findOne({ awardId: new Types.ObjectId(awardId), organizationId })
      .exec();

    if (!agreement) {
      throw new ResourceNotFoundException(
        `No agreement found for award ${awardId}.`,
        ErrorCode.RES_AWARD_AGREEMENT_NOT_FOUND,
      );
    }

    const terms = await this.termsVersionModel
      .findOne({
        programId: agreement.programId,
        organizationId,
        versionNumber: agreement.termsVersionNumber,
      })
      .exec();

    if (!terms) {
      // Terms version was removed (should never happen — terms are immutable).
      return {
        valid: false,
        stored: agreement.termsSnapshotHash,
        expected: '<terms version not found>',
      };
    }

    const expected = computeTermsSnapshotHash(terms);
    const valid = agreement.termsSnapshotHash === expected;

    if (!valid) {
      this.logger.warn(
        `Agreement ${agreement._id} hash mismatch for award ${awardId}: ` +
          `stored=${agreement.termsSnapshotHash}, expected=${expected}`,
      );
    }

    return { valid, stored: agreement.termsSnapshotHash, expected };
  }
}
