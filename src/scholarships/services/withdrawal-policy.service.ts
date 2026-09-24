import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import {
  WithdrawalPolicy,
  WithdrawalPolicyDocument,
  DEFAULT_WITHDRAWAL_POLICY,
} from '../schemas/withdrawal-policy.schema';
import {
  WithdrawApplicationDto,
  UpsertWithdrawalPolicyDto,
} from '../dto/withdrawal.dto';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/** Statuses from which an applicant may self-withdraw. */
const WITHDRAWABLE_STATUSES = [
  ScholarshipApplicationStatus.SUBMITTED,
  ScholarshipApplicationStatus.UNDER_REVIEW,
];

/**
 * Manages application withdrawal with policy-aware consequences.
 *
 * Key invariants:
 *   - Withdrawal preserves the full application document and all review
 *     history; it only changes the status field.
 *   - APPROVED applications can never be withdrawn (the award is committed).
 *   - If the program policy requires confirmation, the DTO must carry
 *     `confirmWithdrawal: true` (enforced at the DTO layer via @Equals).
 *   - Capacity release is delegated to the caller when
 *     `policy.releasesCapacityOnWithdrawal` is true.
 *
 * Privacy:
 *   - `withdrawalReason` may contain applicant PII; it is scoped to
 *     the owning application (tenant-isolated by organizationId).
 */
@Injectable()
export class WithdrawalPolicyService {
  constructor(
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(WithdrawalPolicy.name)
    private readonly policyModel: Model<WithdrawalPolicyDocument>,
  ) {}

  // ── Policy management ─────────────────────────────────────────────────────

  async upsertPolicy(
    organizationId: string,
    programId: string,
    dto: UpsertWithdrawalPolicyDto,
    actorId: string,
  ): Promise<WithdrawalPolicyDocument> {
    const program = await this.programModel
      .findOne({ _id: programId, organizationId })
      .exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }
    return (await this.policyModel.findOneAndUpdate(
      { programId: program._id, organizationId },
      {
        $set: {
          organizationId,
          programId: program._id,
          selfWithdrawalAllowed: dto.selfWithdrawalAllowed,
          windowAfterSubmissionHours: dto.windowAfterSubmissionHours,
          requiresConfirmation: dto.requiresConfirmation,
          releasesCapacityOnWithdrawal: dto.releasesCapacityOnWithdrawal,
          updatedBy: actorId,
        },
        $setOnInsert: { createdBy: actorId },
      },
      { new: true, upsert: true },
    ).exec()) as WithdrawalPolicyDocument;
  }

  async getPolicy(
    organizationId: string,
    programId: string,
  ): Promise<WithdrawalPolicyDocument | null> {
    return this.policyModel
      .findOne({ programId, organizationId })
      .exec();
  }

  // ── Withdrawal ────────────────────────────────────────────────────────────

  /**
   * Withdraws an application according to the program's withdrawal policy.
   *
   * @returns The updated application document with status WITHDRAWN.
   * @throws ResourceNotFoundException if the application does not exist.
   * @throws ForbiddenDomainException if the applicant does not own the application.
   * @throws ResourceConflictException on policy violations.
   */
  async withdraw(
    applicationId: string,
    applicantId: string,
    dto: WithdrawApplicationDto,
  ): Promise<{ application: ScholarshipApplicationDocument; releasesCapacity: boolean }> {
    const application = await this.applicationModel
      .findById(applicationId)
      .exec();

    if (!application) {
      throw new ResourceNotFoundException(
        'Scholarship application not found',
        ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
      );
    }

    // Ownership check
    if (application.applicantId !== applicantId) {
      throw new ForbiddenDomainException(
        'You can only withdraw your own application',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    // Approved applications cannot be withdrawn (award committed)
    if (application.status === ScholarshipApplicationStatus.APPROVED) {
      throw new ResourceConflictException(
        'Approved applications cannot be withdrawn — contact the sponsor to discuss award changes',
        ErrorCode.BIZ_APPROVED_APPLICATION_NOT_WITHDRAWABLE,
      );
    }

    if (!WITHDRAWABLE_STATUSES.includes(application.status)) {
      throw new ResourceConflictException(
        'This application can no longer be withdrawn',
        ErrorCode.BIZ_APPLICATION_NOT_WITHDRAWABLE,
      );
    }

    // Load policy (fall back to permissive defaults if not configured)
    const policy =
      (await this.policyModel
        .findOne({ programId: application.programId })
        .exec()) ?? DEFAULT_WITHDRAWAL_POLICY;

    // Self-withdrawal allowed?
    if (!policy.selfWithdrawalAllowed) {
      throw new ResourceConflictException(
        'Self-withdrawal is not permitted for this program',
        ErrorCode.BIZ_WITHDRAWAL_NOT_ALLOWED,
      );
    }

    // Time-window check
    if (policy.windowAfterSubmissionHours > 0 && application.createdAt) {
      const windowMs = policy.windowAfterSubmissionHours * 60 * 60 * 1000;
      const elapsed = Date.now() - application.createdAt.getTime();
      if (elapsed > windowMs) {
        throw new ResourceConflictException(
          `Withdrawal window of ${policy.windowAfterSubmissionHours} hour(s) has expired`,
          ErrorCode.BIZ_WITHDRAWAL_WINDOW_EXPIRED,
        );
      }
    }

    // Persist withdrawal — review history (decidedAt, decidedBy, decisionReason) is intentionally preserved
    const updated = (await this.applicationModel
      .findOneAndUpdate(
        { _id: application._id, status: { $in: WITHDRAWABLE_STATUSES } },
        {
          $set: {
            status: ScholarshipApplicationStatus.WITHDRAWN,
            withdrawalReasonCategory: dto.withdrawalReasonCategory,
            withdrawalReason: dto.withdrawalReason ?? null,
            withdrawnAt: new Date(),
            withdrawnBy: applicantId,
          },
        },
        { new: true },
      )
      .exec()) as ScholarshipApplicationDocument;

    return {
      application: updated,
      releasesCapacity: policy.releasesCapacityOnWithdrawal,
    };
  }
}
