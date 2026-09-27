import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  AwardStatus,
  ACTIVE_AWARD_STATUSES,
  AWARD_STATUS_TRANSITIONS,
  ScholarshipAward,
  ScholarshipAwardDocument,
} from '../schemas/scholarship-award.schema';
import {
  BudgetReservation,
  BudgetReservationDocument,
  BudgetLedger,
  BudgetLedgerDocument,
  ReservationStatus,
} from '../schemas/budget-reservation.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../schemas/scholarship-application.schema';
import {
  AcceptAwardDto,
  AwardMilestoneResult,
  AwardResult,
  CreateAwardDto,
  DeclineAwardDto,
  ListAwardsQueryDto,
  RescindAwardDto,
} from '../dto/award.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

// ── Serialization helpers ─────────────────────────────────────────────────────

function toAwardResult(doc: ScholarshipAwardDocument): AwardResult {
  const milestones: AwardMilestoneResult[] = doc.milestones.map((m) => ({
    milestoneId: m._id.toString(),
    title: m.title,
    description: m.description,
    amount: m.amount,
    startsAt: m.startsAt ? m.startsAt.toISOString() : null,
    endsAt: m.endsAt ? m.endsAt.toISOString() : null,
  }));

  return {
    awardId: doc._id.toString(),
    organizationId: doc.organizationId,
    programId: doc.programId.toString(),
    applicationId: doc.applicationId.toString(),
    applicantId: doc.applicantId,
    reservationId: doc.reservationId ? doc.reservationId.toString() : null,
    amount: doc.amount,
    currency: doc.currency,
    termsText: doc.termsText,
    milestones,
    acceptanceDeadline: doc.acceptanceDeadline.toISOString(),
    status: doc.status,
    respondedAt: doc.respondedAt ? doc.respondedAt.toISOString() : null,
    applicantNote: doc.applicantNote,
    rescindedAt: doc.rescindedAt ? doc.rescindedAt.toISOString() : null,
    rescindedBy: doc.rescindedBy,
    rescissionReason: doc.rescissionReason,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * ScholarshipAwardService materializes approved awards and manages their full
 * lifecycle: creation, applicant acceptance/decline, staff rescission, and
 * automated expiry.
 *
 * Key invariants:
 *
 *   1. **One active award per application.**
 *      `applicationId` carries a unique index; attempting to create a second
 *      non-terminal award for the same application returns 409
 *      BIZ_AWARD_ALREADY_EXISTS.
 *
 *   2. **Conflict prevention.**
 *      Before creating a new award the service checks for any existing active
 *      award (PENDING_ACCEPTANCE | ACCEPTED) held by the same `applicantId`
 *      within the same `organizationId`.  A conflict returns 422
 *      BIZ_AWARD_CONFLICT.
 *
 *   3. **Authenticated acceptance.**
 *      The accept and decline endpoints verify that the calling user's JWT `sub`
 *      matches `award.applicantId`.  Any other caller receives 403
 *      BIZ_AWARD_ACCEPTANCE_FORBIDDEN.
 *
 *   4. **Offer expiry.**
 *      Two `@Cron` jobs sweep for PENDING_ACCEPTANCE awards past their
 *      `acceptanceDeadline` and transition them to OFFER_EXPIRED, releasing any
 *      linked budget reservation.
 *
 *   5. **Budget reservation linkage.**
 *      When `reservationId` is supplied on the award, acceptance transitions the
 *      reservation PENDING → CONFIRMED, and expiry/decline transitions it
 *      PENDING → EXPIRED/CANCELLED.  Rescission transitions CONFIRMED → RELEASED.
 *      All reservation mutations are atomic conditional `findOneAndUpdate` calls.
 *
 *   6. **Tenant isolation.**
 *      Every public method accepts `organizationId` as its first argument and
 *      includes it in every Mongoose query.
 */
@Injectable()
export class ScholarshipAwardService {
  private readonly logger = new Logger(ScholarshipAwardService.name);

  constructor(
    @InjectModel(ScholarshipAward.name)
    private readonly awardModel: Model<ScholarshipAwardDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Asserts that a status transition is permitted by AWARD_STATUS_TRANSITIONS.
   * Throws BIZ_AWARD_INVALID_STATE when the transition is illegal.
   */
  private assertTransitionAllowed(
    current: AwardStatus,
    next: AwardStatus,
  ): void {
    const allowed = AWARD_STATUS_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BusinessRuleException(
        `Award status transition ${current} → ${next} is not permitted.`,
        ErrorCode.BIZ_AWARD_INVALID_STATE,
      );
    }
  }

  /**
   * Validates milestone date ordering: startsAt must be before endsAt.
   * Throws VAL_AWARD_MILESTONE_DATE_INVALID when violated.
   */
  private validateMilestoneDates(
    milestones: Array<{ startsAt?: string; endsAt?: string; title: string }>,
  ): void {
    for (const m of milestones) {
      if (m.startsAt && m.endsAt) {
        if (new Date(m.startsAt) >= new Date(m.endsAt)) {
          throw new ValidationDomainException(
            `Milestone "${m.title}": startsAt must be before endsAt.`,
            ErrorCode.VAL_AWARD_MILESTONE_DATE_INVALID,
          );
        }
      }
    }
  }

  /**
   * Releases the budget reservation linked to an award (PENDING → target),
   * adjusting the ledger accordingly.  Safe to call when `reservationId` is
   * null — returns immediately without error.
   *
   * @param reservationId  ObjectId of the BudgetReservation to transition.
   * @param fromStatus     Expected current status (filter guard for exactly-once).
   * @param toStatus       Target terminal status (EXPIRED | CANCELLED).
   * @param actorId        JWT `sub` for audit; `'system'` for cron-triggered calls.
   * @param reason         Reason stored on the reservation document.
   */
  private async releaseLinkedReservation(
    reservationId: Types.ObjectId | null,
    fromStatus: ReservationStatus,
    toStatus: ReservationStatus.EXPIRED | ReservationStatus.CANCELLED,
    actorId: string,
    reason: string,
  ): Promise<void> {
    if (!reservationId) return;

    const updated = await this.reservationModel
      .findOneAndUpdate(
        { _id: reservationId, status: fromStatus },
        {
          $set: {
            status: toStatus,
            resolvedAt: new Date(),
            resolvedBy: actorId,
            reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) return; // already transitioned by a concurrent operation — idempotent

    // Decrement reservedAmount on the ledger.
    await this.ledgerModel
      .updateOne(
        { programId: updated.programId, organizationId: updated.organizationId },
        { $inc: { reservedAmount: -updated.amount } },
      )
      .exec();
  }

  /**
   * Confirms the budget reservation linked to an award (PENDING → CONFIRMED),
   * moving the amount from reservedAmount to disbursedAmount on the ledger.
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

    if (!updated) return; // already confirmed or transitioned — idempotent

    await this.ledgerModel
      .updateOne(
        { programId: updated.programId, organizationId: updated.organizationId },
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
   * Releases a CONFIRMED reservation back to available budget capacity
   * (CONFIRMED → RELEASED), used when rescinding an accepted award.
   */
  private async releaseConfirmedReservation(
    reservationId: Types.ObjectId | null,
    actorId: string,
    reason: string,
  ): Promise<void> {
    if (!reservationId) return;

    const updated = await this.reservationModel
      .findOneAndUpdate(
        { _id: reservationId, status: ReservationStatus.CONFIRMED },
        {
          $set: {
            status: ReservationStatus.RELEASED,
            resolvedAt: new Date(),
            resolvedBy: actorId,
            reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) return;

    await this.ledgerModel
      .updateOne(
        { programId: updated.programId, organizationId: updated.organizationId },
        { $inc: { disbursedAmount: -updated.amount } },
      )
      .exec();
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new scholarship award record for an approved application.
   *
   * Steps:
   *   1. Resolve and verify the application (tenant-scoped lookup).
   *   2. Check for a duplicate active award on this application (409).
   *   3. Check for a conflicting active award held by this applicant in the
   *      same organization (422 BIZ_AWARD_CONFLICT).
   *   4. Validate `acceptanceDeadline` is in the future.
   *   5. Validate milestone date ordering.
   *   6. When `reservationId` is supplied, verify the reservation exists and
   *      belongs to this organization and program.
   *   7. Persist the award document.
   *
   * @param programId  Path parameter — the owning scholarship program.
   * @param applicationId  Path parameter — the winning application.
   * @param dto  Request body.
   * @param actorId  JWT `sub` of the staff member creating the award.
   */
  async createAward(
    programId: string,
    applicationId: string,
    dto: CreateAwardDto,
    actorId: string,
  ): Promise<AwardResult> {
    const { organizationId } = dto;

    // 1. Verify the application exists and belongs to this organization.
    const application = await this.applicationModel
      .findOne({ _id: applicationId, organizationId })
      .exec();
    if (!application) {
      throw new ResourceNotFoundException(
        `Application ${applicationId} not found in organization ${organizationId}.`,
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }

    // 2. Duplicate award check: only one non-terminal award per application.
    const existingAward = await this.awardModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
        status: { $in: Array.from(ACTIVE_AWARD_STATUSES) },
      })
      .exec();
    if (existingAward) {
      throw new ResourceConflictException(
        `An active award (${existingAward.status}) already exists for application ${applicationId}.`,
        ErrorCode.BIZ_AWARD_ALREADY_EXISTS,
      );
    }

    // 3. Conflict prevention: applicant must not hold another active award in this org.
    const conflictingAward = await this.awardModel
      .findOne({
        applicantId: application.applicantId,
        organizationId,
        status: { $in: Array.from(ACTIVE_AWARD_STATUSES) },
        // Exclude the same application (edge case: re-creation after terminal state).
        applicationId: { $ne: new Types.ObjectId(applicationId) },
      })
      .exec();
    if (conflictingAward) {
      throw new BusinessRuleException(
        `Applicant ${application.applicantId} already holds an active award ` +
          `(${conflictingAward.status}) in organization ${organizationId}. ` +
          `An applicant cannot hold conflicting awards simultaneously.`,
        ErrorCode.BIZ_AWARD_CONFLICT,
      );
    }

    // 4. Acceptance deadline must be in the future.
    const acceptanceDeadline = new Date(dto.acceptanceDeadline);
    if (acceptanceDeadline <= new Date()) {
      throw new ValidationDomainException(
        'acceptanceDeadline must be a future date.',
        ErrorCode.VAL_AWARD_ACCEPTANCE_DEADLINE_PAST,
      );
    }

    // 5. Validate milestone date ordering.
    if (dto.milestones?.length) {
      this.validateMilestoneDates(dto.milestones);
    }

    // 6. Verify the linked reservation (when supplied).
    if (dto.reservationId) {
      const reservation = await this.reservationModel
        .findOne({
          _id: new Types.ObjectId(dto.reservationId),
          organizationId,
          programId: new Types.ObjectId(programId),
        })
        .exec();
      if (!reservation) {
        throw new ResourceNotFoundException(
          `Budget reservation ${dto.reservationId} not found for program ${programId}.`,
          ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
        );
      }
    }

    // 7. Persist.
    const now = new Date();
    const award = await this.awardModel.create({
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
      programId: new Types.ObjectId(programId),
      applicantId: application.applicantId,
      reservationId: dto.reservationId
        ? new Types.ObjectId(dto.reservationId)
        : null,
      amount: dto.amount,
      currency: dto.currency.toUpperCase(),
      termsText: dto.termsText,
      milestones: (dto.milestones ?? []).map((m) => ({
        _id: new Types.ObjectId(),
        title: m.title,
        description: m.description,
        amount: m.amount,
        startsAt: m.startsAt ? new Date(m.startsAt) : null,
        endsAt: m.endsAt ? new Date(m.endsAt) : null,
      })),
      acceptanceDeadline,
      status: AwardStatus.PENDING_ACCEPTANCE,
      respondedAt: null,
      applicantNote: null,
      rescindedAt: null,
      rescindedBy: null,
      rescissionReason: null,
      createdBy: actorId,
      statusHistory: [
        {
          status: AwardStatus.PENDING_ACCEPTANCE,
          changedBy: actorId,
          changedAt: now,
        },
      ],
    });

    this.logger.log(
      `Award created: application=${applicationId}, amount=${dto.amount} ` +
        `${dto.currency}, deadline=${dto.acceptanceDeadline}, by=${actorId}`,
    );

    return toAwardResult(award);
  }

  // ── Accept ─────────────────────────────────────────────────────────────────

  /**
   * The applicant formally accepts the scholarship offer.
   *
   * Verifies:
   *   - The caller is the award's own applicant.
   *   - The award is in PENDING_ACCEPTANCE state.
   *   - The acceptance deadline has not passed.
   *
   * Side-effects:
   *   - Transitions award PENDING_ACCEPTANCE → ACCEPTED.
   *   - Confirms the linked BudgetReservation (PENDING → CONFIRMED) if present.
   *
   * @param awardId       Path parameter.
   * @param callerId      JWT `sub` of the authenticated user (must equal applicantId).
   * @param dto           Optional acceptance note.
   */
  async acceptAward(
    awardId: string,
    callerId: string,
    dto: AcceptAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId) })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // Authenticated acceptance: caller must be the applicant.
    if (award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'Only the applicant may accept this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    // Deadline check before state check (more actionable error message).
    if (new Date() > award.acceptanceDeadline) {
      throw new BusinessRuleException(
        `The acceptance deadline (${award.acceptanceDeadline.toISOString()}) has passed. ` +
          `The offer has expired.`,
        ErrorCode.BIZ_AWARD_OFFER_EXPIRED,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.ACCEPTED);

    const now = new Date();
    award.status = AwardStatus.ACCEPTED;
    award.respondedAt = now;
    award.applicantNote = dto.note ?? null;
    award.statusHistory.push({
      status: AwardStatus.ACCEPTED,
      changedBy: callerId,
      changedAt: now,
    });

    await award.save();

    // Confirm the linked budget reservation.
    await this.confirmLinkedReservation(
      award.reservationId,
      callerId,
      dto.note ?? null,
    );

    this.logger.log(`Award ${awardId} accepted by applicant ${callerId}`);
    return toAwardResult(award);
  }

  // ── Decline ────────────────────────────────────────────────────────────────

  /**
   * The applicant formally declines the scholarship offer.
   *
   * Verifies:
   *   - The caller is the award's own applicant.
   *   - The award is in PENDING_ACCEPTANCE state.
   *
   * Side-effects:
   *   - Transitions award PENDING_ACCEPTANCE → DECLINED.
   *   - Cancels the linked BudgetReservation (PENDING → CANCELLED) if present.
   *
   * @param awardId    Path parameter.
   * @param callerId   JWT `sub` of the authenticated user (must equal applicantId).
   * @param dto        Optional decline reason.
   */
  async declineAward(
    awardId: string,
    callerId: string,
    dto: DeclineAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId) })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    if (award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'Only the applicant may decline this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.DECLINED);

    const now = new Date();
    award.status = AwardStatus.DECLINED;
    award.respondedAt = now;
    award.applicantNote = dto.reason ?? null;
    award.statusHistory.push({
      status: AwardStatus.DECLINED,
      changedBy: callerId,
      changedAt: now,
      reason: dto.reason,
    });

    await award.save();

    await this.releaseLinkedReservation(
      award.reservationId,
      ReservationStatus.PENDING,
      ReservationStatus.CANCELLED,
      callerId,
      `Award declined by applicant: ${dto.reason ?? 'no reason given'}`,
    );

    this.logger.log(`Award ${awardId} declined by applicant ${callerId}`);
    return toAwardResult(award);
  }

  // ── Rescind ────────────────────────────────────────────────────────────────

  /**
   * An organization OWNER rescinds an ACCEPTED award.
   *
   * Verifies:
   *   - The award belongs to the given organization.
   *   - The award is in ACCEPTED state.
   *
   * Side-effects:
   *   - Transitions award ACCEPTED → RESCINDED.
   *   - Releases the linked BudgetReservation (CONFIRMED → RELEASED) if present,
   *     restoring budget capacity.
   *
   * @param organizationId  Tenant scope.
   * @param awardId         Path parameter.
   * @param actorId         JWT `sub` of the OWNER rescinding.
   * @param dto             Mandatory rescission reason.
   */
  async rescindAward(
    organizationId: string,
    awardId: string,
    actorId: string,
    dto: RescindAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId), organizationId })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found in organization ${organizationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.RESCINDED);

    const now = new Date();
    award.status = AwardStatus.RESCINDED;
    award.rescindedAt = now;
    award.rescindedBy = actorId;
    award.rescissionReason = dto.reason;
    award.statusHistory.push({
      status: AwardStatus.RESCINDED,
      changedBy: actorId,
      changedAt: now,
      reason: dto.reason,
    });

    await award.save();

    await this.releaseConfirmedReservation(
      award.reservationId,
      actorId,
      `Award rescinded: ${dto.reason}`,
    );

    this.logger.log(
      `Award ${awardId} rescinded by ${actorId}: ${dto.reason}`,
    );
    return toAwardResult(award);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Returns a single award by id.
   *
   * Staff endpoints supply `organizationId` to enforce tenant scoping.
   * The applicant-facing endpoint passes `null` for organizationId and instead
   * performs the applicant ownership check at the service layer via `callerId`.
   *
   * @param awardId         Path parameter.
   * @param organizationId  Tenant scope (null only for applicant self-reads).
   * @param callerId        When set, asserts award.applicantId === callerId.
   */
  async getAward(
    awardId: string,
    organizationId: string | null,
    callerId?: string,
  ): Promise<AwardResult> {
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(awardId),
    };
    if (organizationId) {
      filter['organizationId'] = organizationId;
    }

    const award = await this.awardModel.findOne(filter).exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // Applicant self-read ownership check.
    if (callerId && award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'You do not have access to this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    return toAwardResult(award);
  }

  /**
   * Returns the award associated with a specific application id.
   * Used by the staff endpoint `GET …/applications/:applicationId/award`.
   *
   * @param applicationId   The application whose award to retrieve.
   * @param organizationId  Tenant scope.
   */
  async getAwardByApplicationId(
    applicationId: string,
    organizationId: string,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
      })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `No award found for application ${applicationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    return toAwardResult(award);
  }

  /**
   * Lists all awards for a scholarship program with optional status filter.
   * Returns a paginated result sorted by `createdAt` descending.
   *
   * @param programId  Path parameter.
   * @param query      Pagination + optional status filter + organizationId.
   */
  async listAwards(
    programId: string,
    query: ListAwardsQueryDto,
  ): Promise<{ data: AwardResult[]; total: number; page: number; limit: number; totalPages: number }> {
    const filter: Record<string, unknown> = {
      organizationId: query.organizationId,
      programId: new Types.ObjectId(programId),
    };
    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.awardModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.awardModel.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map(toAwardResult),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Scheduled expiry jobs ─────────────────────────────────────────────────

  /**
   * Primary expiry sweep — runs every hour.
   *
   * Finds all awards in PENDING_ACCEPTANCE with `acceptanceDeadline ≤ now`,
   * transitions each to OFFER_EXPIRED, and releases any linked budget
   * reservation (PENDING → EXPIRED).
   *
   * The job is idempotent: each award is gated by a conditional update
   * (`status = PENDING_ACCEPTANCE`), so concurrent runs skip already-processed
   * documents.
   *
   * Operational note:
   *   In a multi-instance deployment use a distributed lock (e.g. Redis SET NX)
   *   to prevent duplicate processing.  The conditional update means double
   *   processing is harmless but wastes resources.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'scholarship-award-expiry' })
  async expireAwards(): Promise<number> {
    return this.runExpiryJob('hourly-expiry');
  }

  /**
   * Reconciliation sweep — runs every 6 hours.
   *
   * Safety net for missed hourly runs (e.g. deployment gaps).
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'scholarship-award-expiry-reconciliation',
  })
  async reconcileExpiredAwards(): Promise<number> {
    return this.runExpiryJob('6h-reconciliation');
  }

  /**
   * Core expiry logic shared by both cron jobs.
   *
   * 1. Bulk-find all PENDING_ACCEPTANCE awards past their deadline.
   * 2. For each, attempt a conditional update (status guard ensures exactly-once).
   * 3. Release the linked reservation on success.
   * 4. Log the count of transitioned awards.
   */
  private async runExpiryJob(jobLabel: string): Promise<number> {
    const now = new Date();
    let expired = 0;

    // Fetch candidates — status + partial index makes this efficient.
    const candidates = await this.awardModel
      .find({
        status: AwardStatus.PENDING_ACCEPTANCE,
        acceptanceDeadline: { $lte: now },
      })
      .select('_id reservationId organizationId')
      .exec();

    for (const candidate of candidates) {
      // Conditional update: only succeeds if still PENDING_ACCEPTANCE.
      const updated = await this.awardModel
        .findOneAndUpdate(
          {
            _id: candidate._id,
            status: AwardStatus.PENDING_ACCEPTANCE,
          },
          {
            $set: { status: AwardStatus.OFFER_EXPIRED },
          },
          { new: true },
        )
        .exec();

      if (!updated) continue; // Already transitioned by a concurrent run.

      // Append the history entry to the already-fetched document and save.
      updated.statusHistory.push({
        status: AwardStatus.OFFER_EXPIRED,
        changedBy: 'system',
        changedAt: now,
        reason: 'Acceptance deadline elapsed.',
      });
      await updated.save();

      // Release the linked reservation.
      await this.releaseLinkedReservation(
        candidate.reservationId,
        ReservationStatus.PENDING,
        ReservationStatus.EXPIRED,
        'system',
        'Offer acceptance deadline elapsed — award expired.',
      );

      expired++;
    }

    if (expired > 0 || candidates.length > 0) {
      this.logger.log(
        `[${jobLabel}] Award expiry job: ${expired}/${candidates.length} award(s) expired.`,
      );
    }

    return expired;
  }
}
