import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../../common/audit/audit-context';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPaymentEligiblePayload } from '../../events/payloads/scholarship-payment-eligible.payload';
import {
  AssignVerifierDto,
  RecordVerificationDecisionDto,
} from '../dto/verification.dto';
import {
  MilestoneProgress,
  MilestoneProgressDocument,
} from '../schemas/milestone-progress.schema';
import {
  PaymentEligibility,
  PaymentEligibilityDocument,
} from '../schemas/payment-eligibility.schema';
import {
  VerificationDecision,
  VerificationDecisionDocument,
} from '../schemas/verification-decision.schema';
import {
  VerifierAssignment,
  VerifierAssignmentDocument,
} from '../schemas/verifier-assignment.schema';
import {
  MILESTONE_KEY_PATTERN,
  MilestoneProgressStatus,
  PROGRESS_STATUS_BY_DECISION,
  REASON_CODES_BY_DECISION,
  VerificationDecisionType,
  VerifierAssignmentStatus,
} from '../scholarship.constants';
import { isDuplicateKeyError, ScholarshipActor } from '../scholarship-actor';
import { MilestoneEvidenceService } from './milestone-evidence.service';
import { MilestoneScheduleService } from './milestone-schedule.service';
import { ScholarshipAccessService } from './scholarship-access.service';

export interface DecisionResult {
  decision: VerificationDecisionDocument;
  progressStatus: MilestoneProgressStatus;
  /** Present only on approvals. */
  paymentEligibility: PaymentEligibilityDocument | null;
}

/**
 * Verifier assignment and evidence decisions.
 *
 * Conflict-of-interest rules (all enforced server-side, none bypassable by the
 * platform-admin break-glass):
 *  - the recipient can never verify their own award;
 *  - nobody can assign themselves as a verifier;
 *  - a verifier cannot decide evidence they submitted;
 *  - a verifier must be an active member of the award's organization.
 */
@Injectable()
export class MilestoneVerificationService {
  private readonly logger = new Logger(MilestoneVerificationService.name);

  constructor(
    @InjectModel(VerifierAssignment.name)
    private readonly assignmentModel: Model<VerifierAssignmentDocument>,
    @InjectModel(VerificationDecision.name)
    private readonly decisionModel: Model<VerificationDecisionDocument>,
    @InjectModel(MilestoneProgress.name)
    private readonly progressModel: Model<MilestoneProgressDocument>,
    @InjectModel(PaymentEligibility.name)
    private readonly eligibilityModel: Model<PaymentEligibilityDocument>,
    private readonly access: ScholarshipAccessService,
    private readonly schedules: MilestoneScheduleService,
    private readonly evidence: MilestoneEvidenceService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Assignments ─────────────────────────────────────────────────────────

  async assign(
    organizationId: string,
    awardId: string,
    dto: AssignVerifierDto,
    actor: ScholarshipActor,
  ): Promise<VerifierAssignmentDocument> {
    const award = await this.access.requireAward(organizationId, awardId);

    if (dto.verifierId === award.recipientId) {
      throw this.conflict('The award recipient cannot verify their own award');
    }
    if (dto.verifierId === actor.userId) {
      throw this.conflict('You cannot assign yourself as a verifier');
    }
    if (!(await this.access.membershipRole(organizationId, dto.verifierId))) {
      throw this.conflict('Verifiers must be members of the organization');
    }

    const milestoneKeys = dto.milestoneKeys ?? [];
    if (milestoneKeys.length > 0) {
      const schedule = await this.schedules.requireActive(
        organizationId,
        awardId,
      );
      const known = new Set(schedule.milestones.map((m) => m.key));
      const unknown = milestoneKeys.filter((k) => !known.has(k));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown milestone key(s): ${unknown.join(', ')}`,
        );
      }
    }

    let assignment: VerifierAssignmentDocument;
    try {
      assignment = await new this.assignmentModel({
        organizationId,
        awardId,
        verifierId: dto.verifierId,
        milestoneKeys,
        assignedBy: actor.userId,
      }).save();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'Verifier already has an active assignment on this award; revoke it first',
        );
      }
      throw err;
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_VERIFIER_ASSIGNED,
      context: actor.audit,
      target: { type: 'scholarship_verifier_assignment', id: assignment.id },
      after: { awardId, verifierId: dto.verifierId, milestoneKeys },
    });
    return assignment;
  }

  async revoke(
    organizationId: string,
    awardId: string,
    assignmentId: string,
    actor: ScholarshipActor,
  ): Promise<VerifierAssignmentDocument> {
    const revoked = await this.assignmentModel
      .findOneAndUpdate(
        {
          _id: assignmentId,
          organizationId,
          awardId,
          status: VerifierAssignmentStatus.ACTIVE,
        },
        {
          $set: {
            status: VerifierAssignmentStatus.REVOKED,
            revokedBy: actor.userId,
            revokedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!revoked) {
      throw new ResourceNotFoundException(
        'Active verifier assignment not found',
      );
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_VERIFIER_REVOKED,
      context: actor.audit,
      target: { type: 'scholarship_verifier_assignment', id: revoked.id },
      before: { status: VerifierAssignmentStatus.ACTIVE },
      after: { status: VerifierAssignmentStatus.REVOKED },
    });
    return revoked;
  }

  async listAssignments(
    organizationId: string,
    awardId: string,
  ): Promise<VerifierAssignment[]> {
    await this.access.requireAward(organizationId, awardId);
    return this.assignmentModel
      .find({ organizationId, awardId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async listDecisions(
    organizationId: string,
    awardId: string,
    milestoneKey: string,
    actor: ScholarshipActor,
  ): Promise<VerificationDecision[]> {
    if (!MILESTONE_KEY_PATTERN.test(milestoneKey)) {
      throw new BadRequestException('milestoneKey is malformed');
    }
    const award = await this.access.requireAward(organizationId, awardId);
    await this.access.assertCanReadEvidence(award, actor, milestoneKey);
    return this.decisionModel
      .find({ organizationId, awardId, milestoneKey })
      .sort({ createdAt: 1 })
      .exec();
  }

  // ── Decisions ───────────────────────────────────────────────────────────

  async decide(
    organizationId: string,
    awardId: string,
    evidenceId: string,
    dto: RecordVerificationDecisionDto,
    actor: ScholarshipActor,
  ): Promise<DecisionResult> {
    if (!REASON_CODES_BY_DECISION[dto.decision].includes(dto.reasonCode)) {
      throw new BusinessRuleException(
        `Reason code ${dto.reasonCode} is not valid for decision "${dto.decision}"`,
        ErrorCode.BIZ_SCHOLARSHIP_REASON_CODE_MISMATCH,
      );
    }

    const award = await this.access.requireAward(organizationId, awardId);
    const evidence = await this.evidence.requireEvidence(
      organizationId,
      awardId,
      evidenceId,
    );
    const milestoneKey = evidence.milestoneKey;

    if (actor.userId === award.recipientId) {
      throw this.conflict('The award recipient cannot verify their own award');
    }
    if (actor.userId === evidence.submittedBy) {
      throw this.conflict('You cannot decide evidence you submitted');
    }
    const assignment = await this.access.activeAssignment(
      awardId,
      actor.userId,
      milestoneKey,
    );
    if (!assignment) {
      throw new ForbiddenDomainException(
        'You are not an assigned verifier for this milestone',
        ErrorCode.BIZ_SCHOLARSHIP_VERIFIER_NOT_ASSIGNED,
      );
    }

    const schedule = await this.schedules.requireActive(
      organizationId,
      awardId,
    );
    if (!schedule.milestones.some((m) => m.key === milestoneKey)) {
      throw new BusinessRuleException(
        'Milestone is not part of the active schedule',
        ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
      );
    }

    // Claim the milestone with a compare-and-set. Only the request that moves
    // it out of `evidence_submitted` *for this evidence version* proceeds, so
    // concurrent or repeated decisions cannot both succeed.
    const decisionId = new Types.ObjectId();
    const nextStatus = PROGRESS_STATUS_BY_DECISION[dto.decision];
    const claimed = await this.progressModel
      .findOneAndUpdate(
        {
          awardId,
          milestoneKey,
          status: MilestoneProgressStatus.EVIDENCE_SUBMITTED,
          latestEvidenceId: evidence.id,
        },
        {
          $set: {
            status: nextStatus,
            lastDecisionId: decisionId.toHexString(),
            decidedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      throw await this.explainUnclaimable(awardId, milestoneKey, evidence.id);
    }

    let decision: VerificationDecisionDocument;
    try {
      decision = await new this.decisionModel({
        _id: decisionId,
        organizationId,
        awardId,
        milestoneKey,
        evidenceId: evidence.id,
        evidenceVersion: evidence.version,
        decision: dto.decision,
        reasonCode: dto.reasonCode,
        note: dto.note ?? null,
        verifierId: actor.userId,
        assignmentId: assignment.id,
      }).save();
    } catch (err) {
      await this.progressModel
        .updateOne(
          { awardId, milestoneKey, lastDecisionId: decisionId.toHexString() },
          {
            $set: {
              status: MilestoneProgressStatus.EVIDENCE_SUBMITTED,
              lastDecisionId: null,
              decidedAt: null,
            },
          },
        )
        .exec();
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'This evidence version has already been decided',
          ErrorCode.BIZ_SCHOLARSHIP_ALREADY_DECIDED,
        );
      }
      throw err;
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_VERIFICATION_DECIDED,
      context: actor.audit,
      target: { type: 'scholarship_verification_decision', id: decision.id },
      before: {
        milestoneKey,
        status: MilestoneProgressStatus.EVIDENCE_SUBMITTED,
      },
      after: {
        milestoneKey,
        status: nextStatus,
        evidenceId: evidence.id,
        evidenceVersion: evidence.version,
        decision: dto.decision,
        reasonCode: dto.reasonCode,
      },
      reason: dto.reasonCode,
    });

    const paymentEligibility =
      dto.decision === VerificationDecisionType.APPROVE
        ? await this.ensurePaymentEligibility(claimed, actor.audit)
        : null;

    return { decision, progressStatus: nextStatus, paymentEligibility };
  }

  /**
   * Creates the payment eligibility for an approved milestone if it does not
   * exist yet, and emits the eligibility event only when this call created it.
   * Safe to call any number of times — used by `decide` and by the
   * reconciliation job to repair an approval whose eligibility write failed.
   */
  async ensurePaymentEligibility(
    progress: MilestoneProgress,
    audit: AuditContext = systemAuditContext('scholarship-reconciliation'),
  ): Promise<PaymentEligibilityDocument> {
    const existing = await this.eligibilityModel
      .findOne({
        awardId: progress.awardId,
        milestoneKey: progress.milestoneKey,
      })
      .exec();
    if (existing) return existing;

    const award = await this.access.requireAward(
      progress.organizationId,
      progress.awardId,
    );
    const schedule = await this.schedules.requireActive(
      progress.organizationId,
      progress.awardId,
    );
    const milestone = schedule.milestones.find(
      (m) => m.key === progress.milestoneKey,
    );
    if (!milestone || !progress.lastDecisionId || !progress.latestEvidenceId) {
      throw new BusinessRuleException(
        `Milestone ${progress.milestoneKey} cannot be made payable`,
        ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
      );
    }

    let eligibility: PaymentEligibilityDocument;
    try {
      eligibility = await new this.eligibilityModel({
        organizationId: award.organizationId,
        awardId: award.id,
        scheduleId: schedule.id,
        milestoneKey: milestone.key,
        evidenceId: progress.latestEvidenceId,
        decisionId: progress.lastDecisionId,
        amountMinor: milestone.amountMinor,
        currency: award.currency,
        recipientId: award.recipientId,
        recipientWallet: award.recipientWallet,
      }).save();
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Someone else created it first; they own the event.
      return (await this.eligibilityModel
        .findOne({
          awardId: progress.awardId,
          milestoneKey: progress.milestoneKey,
        })
        .exec())!;
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_ELIGIBLE,
      context: audit,
      target: { type: 'scholarship_payment_eligibility', id: eligibility.id },
      after: {
        awardId: eligibility.awardId,
        milestoneKey: eligibility.milestoneKey,
        amountMinor: eligibility.amountMinor,
        currency: eligibility.currency,
      },
    });

    const payload = Object.assign(new ScholarshipPaymentEligiblePayload(), {
      eligibilityId: eligibility.id,
      organizationId: eligibility.organizationId,
      awardId: eligibility.awardId,
      milestoneKey: eligibility.milestoneKey,
      amountMinor: eligibility.amountMinor,
      currency: eligibility.currency,
    });
    this.eventEmitter.emit(DomainEvents.SCHOLARSHIP_PAYMENT_ELIGIBLE, payload);

    return eligibility;
  }

  /** Approved milestones that have no eligibility record (crash repair). */
  async findApprovedWithoutEligibility(
    limit: number,
  ): Promise<MilestoneProgressDocument[]> {
    const approved = await this.progressModel
      .find({ status: MilestoneProgressStatus.APPROVED })
      .sort({ decidedAt: 1 })
      .limit(limit * 5)
      .exec();
    if (approved.length === 0) return [];

    const eligible = await this.eligibilityModel
      .find({ awardId: { $in: [...new Set(approved.map((p) => p.awardId))] } })
      .select('awardId milestoneKey')
      .lean()
      .exec();
    const done = new Set(eligible.map((e) => `${e.awardId}:${e.milestoneKey}`));
    return approved
      .filter((p) => !done.has(`${p.awardId}:${p.milestoneKey}`))
      .slice(0, limit);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private conflict(message: string): ForbiddenDomainException {
    return new ForbiddenDomainException(
      message,
      ErrorCode.BIZ_SCHOLARSHIP_VERIFIER_CONFLICT,
    );
  }

  private async explainUnclaimable(
    awardId: string,
    milestoneKey: string,
    evidenceId: string,
  ): Promise<Error> {
    if (await this.decisionModel.exists({ evidenceId })) {
      return new ResourceConflictException(
        'This evidence version has already been decided',
        ErrorCode.BIZ_SCHOLARSHIP_ALREADY_DECIDED,
      );
    }
    const progress = await this.progressModel
      .findOne({ awardId, milestoneKey })
      .exec();
    if (progress && progress.latestEvidenceId !== evidenceId) {
      return new ResourceConflictException(
        'A newer evidence version exists; decide the latest version',
        ErrorCode.BIZ_SCHOLARSHIP_EVIDENCE_STALE,
      );
    }
    return new BusinessRuleException(
      `Milestone is ${progress?.status ?? 'unknown'} and not awaiting a decision`,
      ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
    );
  }
}
