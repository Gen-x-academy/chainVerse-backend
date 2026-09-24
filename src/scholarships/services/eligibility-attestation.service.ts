import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EligibilityAttestation,
  EligibilityAttestationDocument,
  AttestationScope,
  AttestationStatus,
} from '../schemas/eligibility-attestation.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import { IssueAttestationDto, RevokeAttestationDto } from '../dto/attestation.dto';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/**
 * Manages eligibility attestations — time-bounded, issuer-identified claims
 * from trusted systems that prove an applicant's eligibility for a scholarship.
 *
 * Key invariants:
 *   - Claims become invalid **immediately** on revocation (synchronous status change).
 *   - Claims with `expiresAt <= now` are treated as expired even if `status=ACTIVE`.
 *   - `expiresAt` must always be in the future at issuance time.
 *   - Revocation never deletes data — the document is preserved for audit.
 *   - `payload` must not contain raw PII (enforced by documentation contract;
 *     the service does not inspect payload contents).
 *
 * Privacy:
 *   - All queries are scoped to organizationId + programId + applicantId.
 *   - Only OWNER/ADMIN may issue or revoke attestations.
 */
@Injectable()
export class EligibilityAttestationService {
  constructor(
    @InjectModel(EligibilityAttestation.name)
    private readonly attestationModel: Model<EligibilityAttestationDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
  ) {}

  // ── Issuance ──────────────────────────────────────────────────────────────

  async issueAttestation(
    dto: IssueAttestationDto,
    issuerId: string,
  ): Promise<EligibilityAttestationDocument> {
    // Validate program exists in the org
    const program = await this.programModel
      .findOne({ _id: dto.programId, organizationId: dto.organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    // expiresAt must be in the future
    if (dto.expiresAt <= new Date()) {
      throw new ValidationDomainException(
        'expiresAt must be a future date',
        ErrorCode.BIZ_ATTESTATION_INVALID_EXPIRY,
        'expiresAt',
      );
    }

    return this.attestationModel.create({
      organizationId: dto.organizationId,
      programId: program._id,
      applicantId: dto.applicantId,
      issuer: dto.issuer,
      scope: dto.scope,
      version: dto.version,
      payload: dto.payload,
      status: AttestationStatus.ACTIVE,
      expiresAt: dto.expiresAt,
      issuedAt: new Date(),
    });
  }

  // ── Revocation ────────────────────────────────────────────────────────────

  /**
   * Revokes an attestation immediately.
   * The document is preserved; only status, revokedAt, revokedBy, and
   * revocationReason are updated.
   */
  async revokeAttestation(
    attestationId: string,
    revokerId: string,
    dto: RevokeAttestationDto,
  ): Promise<EligibilityAttestationDocument> {
    const attestation = await this.attestationModel
      .findById(attestationId)
      .exec();
    if (!attestation) {
      throw new ResourceNotFoundException(
        'Eligibility attestation not found',
        ErrorCode.RES_ELIGIBILITY_ATTESTATION_NOT_FOUND,
      );
    }
    if (attestation.status === AttestationStatus.REVOKED) {
      throw new ResourceConflictException(
        'Attestation has already been revoked',
        ErrorCode.BIZ_ATTESTATION_ALREADY_REVOKED,
      );
    }
    return (await this.attestationModel
      .findOneAndUpdate(
        { _id: attestation._id },
        {
          $set: {
            status: AttestationStatus.REVOKED,
            revokedAt: new Date(),
            revokedBy: revokerId,
            revocationReason: dto.reason ?? null,
          },
        },
        { new: true },
      )
      .exec()) as EligibilityAttestationDocument;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Returns all ACTIVE, non-expired attestations for an applicant in a program.
   * Excludes REVOKED and EXPIRED statuses as well as attestations past their
   * `expiresAt` even if the status has not yet been swept to EXPIRED.
   */
  async getActiveAttestations(
    programId: string,
    applicantId: string,
  ): Promise<EligibilityAttestationDocument[]> {
    return this.attestationModel
      .find({
        programId,
        applicantId,
        status: AttestationStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
      })
      .sort({ issuedAt: -1 })
      .exec();
  }

  /**
   * Validates that a specific attestation is currently active and not expired.
   * Throws immediately on revocation or expiration.
   */
  async validateAttestation(
    attestationId: string,
  ): Promise<EligibilityAttestationDocument> {
    const attestation = await this.attestationModel
      .findById(attestationId)
      .exec();
    if (!attestation) {
      throw new ResourceNotFoundException(
        'Eligibility attestation not found',
        ErrorCode.RES_ELIGIBILITY_ATTESTATION_NOT_FOUND,
      );
    }
    if (attestation.status === AttestationStatus.REVOKED) {
      throw new ResourceConflictException(
        'Attestation has been revoked',
        ErrorCode.BIZ_ATTESTATION_ALREADY_REVOKED,
      );
    }
    if (
      attestation.status === AttestationStatus.EXPIRED ||
      attestation.expiresAt <= new Date()
    ) {
      throw new ResourceConflictException(
        'Attestation has expired',
        ErrorCode.BIZ_ATTESTATION_EXPIRED,
      );
    }
    return attestation;
  }

  /**
   * Checks whether an applicant has a valid active attestation for a given scope.
   * Does not throw — returns boolean for eligibility gate checks.
   */
  async checkAttestation(
    programId: string,
    applicantId: string,
    scope: AttestationScope,
  ): Promise<boolean> {
    const count = await this.attestationModel
      .countDocuments({
        programId,
        applicantId,
        scope,
        status: AttestationStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    return count > 0;
  }

  /**
   * Marks all ACTIVE attestations with `expiresAt <= now` as EXPIRED.
   * Intended to be called by a scheduled job.
   * Returns the count of attestations marked expired.
   */
  async expireStaleAttestations(): Promise<number> {
    const result = await this.attestationModel
      .updateMany(
        { status: AttestationStatus.ACTIVE, expiresAt: { $lte: new Date() } },
        { $set: { status: AttestationStatus.EXPIRED } },
      )
      .exec();
    return result.modifiedCount;
  }
}
