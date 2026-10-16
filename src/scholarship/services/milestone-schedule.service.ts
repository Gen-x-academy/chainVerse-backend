import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { Role } from '../../common/enums/role.enum';
import {
  allocateSchedule,
  AllocatedMilestone,
  sameMilestoneTerms,
} from '../domain/schedule-allocation';
import {
  DecideScheduleAmendmentDto,
  MilestoneDefinitionDto,
  MilestoneScheduleDto,
  ProposeScheduleAmendmentDto,
} from '../dto/milestone-schedule.dto';
import {
  MilestoneProgress,
  MilestoneProgressDocument,
} from '../schemas/milestone-progress.schema';
import {
  MilestoneSchedule,
  MilestoneScheduleDocument,
} from '../schemas/milestone-schedule.schema';
import { ScholarshipAwardDocument } from '../schemas/scholarship-award.schema';
import {
  LOCKED_MILESTONE_STATUSES,
  MilestoneProgressStatus,
  MilestoneScheduleStatus,
  ScholarshipAwardStatus,
} from '../scholarship.constants';
import { isDuplicateKeyError, ScholarshipActor } from '../scholarship-actor';
import { ScholarshipAccessService } from './scholarship-access.service';

const TARGET_TYPE = 'scholarship_milestone_schedule';

const scheduleAudit = (s: MilestoneSchedule) => ({
  awardId: s.awardId,
  version: s.version,
  status: s.status,
  milestones: s.milestones.map((m) => ({
    key: m.key,
    type: m.type,
    percentageBps: m.percentageBps,
    amountMinor: m.amountMinor,
    dueDate: m.dueDate,
  })),
});

/**
 * Owns milestone-based disbursement schedules.
 *
 * Invariants:
 *  - milestone amounts always sum exactly to the award total;
 *  - due dates strictly increase and fall inside the award period;
 *  - once active, a schedule never changes. The only way to alter the plan is
 *    an amendment proposed by one owner/admin and approved by a *different*
 *    one, which may not remove or re-price a milestone that already has
 *    evidence under review or a decision.
 */
@Injectable()
export class MilestoneScheduleService {
  private readonly logger = new Logger(MilestoneScheduleService.name);

  constructor(
    @InjectModel(MilestoneSchedule.name)
    private readonly scheduleModel: Model<MilestoneScheduleDocument>,
    @InjectModel(MilestoneProgress.name)
    private readonly progressModel: Model<MilestoneProgressDocument>,
    private readonly access: ScholarshipAccessService,
    private readonly auditService: AuditService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────────

  async list(
    organizationId: string,
    awardId: string,
  ): Promise<MilestoneSchedule[]> {
    await this.access.requireAward(organizationId, awardId);
    return this.scheduleModel
      .find({ organizationId, awardId })
      .sort({ version: -1 })
      .exec();
  }

  async findOne(
    organizationId: string,
    awardId: string,
    scheduleId: string,
  ): Promise<MilestoneScheduleDocument> {
    const schedule = await this.scheduleModel
      .findOne({ _id: scheduleId, organizationId, awardId })
      .exec();
    if (!schedule) {
      throw new ResourceNotFoundException('Milestone schedule not found');
    }
    return schedule;
  }

  findActive(
    organizationId: string,
    awardId: string,
  ): Promise<MilestoneScheduleDocument | null> {
    return this.scheduleModel
      .findOne({
        organizationId,
        awardId,
        status: MilestoneScheduleStatus.ACTIVE,
      })
      .exec();
  }

  async requireActive(
    organizationId: string,
    awardId: string,
  ): Promise<MilestoneScheduleDocument> {
    const active = await this.findActive(organizationId, awardId);
    if (!active) {
      throw new ResourceNotFoundException(
        'Award has no active milestone schedule',
      );
    }
    return active;
  }

  /**
   * Active schedule for anyone entitled to see it: the recipient, any member
   * of the owning organization, or a platform admin.
   */
  async findActiveForViewer(
    organizationId: string,
    awardId: string,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const award = await this.access.requireAward(organizationId, awardId);
    const allowed =
      this.access.isRecipient(award, actor) ||
      actor.platformRole === Role.ADMIN ||
      (await this.access.membershipRole(organizationId, actor.userId)) !== null;
    if (!allowed) {
      throw new ForbiddenDomainException(
        'You may not view this award',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return this.requireActive(organizationId, awardId);
  }

  // ── Drafts ──────────────────────────────────────────────────────────────

  async createDraft(
    organizationId: string,
    awardId: string,
    dto: MilestoneScheduleDto,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const award = await this.requireActiveAward(organizationId, awardId);

    if (await this.findActive(organizationId, awardId)) {
      throw new ResourceConflictException(
        'Award already has an active schedule; propose an amendment instead',
        ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_IMMUTABLE,
      );
    }

    const milestones = this.allocateOrThrow(award, dto);

    let schedule: MilestoneScheduleDocument;
    try {
      schedule = await new this.scheduleModel({
        organizationId,
        awardId,
        version: await this.nextVersion(awardId),
        status: MilestoneScheduleStatus.DRAFT,
        totalAmountMinor: award.totalAmountMinor,
        currency: award.currency,
        milestones,
        createdBy: actor.userId,
      }).save();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'Award already has an open draft schedule',
        );
      }
      throw err;
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_SCHEDULE_CREATED,
      context: actor.audit,
      target: { type: TARGET_TYPE, id: schedule.id },
      after: scheduleAudit(schedule),
    });
    return schedule;
  }

  async updateDraft(
    organizationId: string,
    awardId: string,
    scheduleId: string,
    dto: MilestoneScheduleDto,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const award = await this.requireActiveAward(organizationId, awardId);
    const before = await this.findOne(organizationId, awardId, scheduleId);
    const milestones = this.allocateOrThrow(award, dto);

    // The `status: draft` filter is what lets the immutability hook accept
    // this write; an activated schedule simply does not match.
    const updated = await this.scheduleModel
      .findOneAndUpdate(
        {
          _id: scheduleId,
          organizationId,
          awardId,
          status: MilestoneScheduleStatus.DRAFT,
        },
        { $set: { milestones } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new ResourceConflictException(
        `Schedule is ${before.status} and can no longer be edited`,
        ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_IMMUTABLE,
      );
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_SCHEDULE_UPDATED,
      context: actor.audit,
      target: { type: TARGET_TYPE, id: updated.id },
      before: scheduleAudit(before),
      after: scheduleAudit(updated),
    });
    return updated;
  }

  async activate(
    organizationId: string,
    awardId: string,
    scheduleId: string,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const award = await this.requireActiveAward(organizationId, awardId);
    const draft = await this.findOne(organizationId, awardId, scheduleId);

    if (draft.status !== MilestoneScheduleStatus.DRAFT) {
      throw new ResourceConflictException(
        `Only draft schedules can be activated; this one is ${draft.status}`,
        ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_IMMUTABLE,
      );
    }
    // Re-check reconciliation at the moment the plan becomes binding.
    this.allocateOrThrow(award, { milestones: draft.milestones });

    let activated: MilestoneScheduleDocument | null;
    try {
      activated = await this.scheduleModel
        .findOneAndUpdate(
          { _id: scheduleId, status: MilestoneScheduleStatus.DRAFT },
          {
            $set: {
              status: MilestoneScheduleStatus.ACTIVE,
              activatedAt: new Date(),
              activatedBy: actor.userId,
            },
          },
          { new: true },
        )
        .exec();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'Award already has an active schedule',
          ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_IMMUTABLE,
        );
      }
      throw err;
    }
    if (!activated) {
      throw new ResourceConflictException(
        'Schedule was changed concurrently; reload and retry',
      );
    }

    await this.seedProgress(activated);

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_SCHEDULE_ACTIVATED,
      context: actor.audit,
      target: { type: TARGET_TYPE, id: activated.id },
      before: { status: MilestoneScheduleStatus.DRAFT },
      after: scheduleAudit(activated),
    });
    return activated;
  }

  // ── Governed amendments ─────────────────────────────────────────────────

  async proposeAmendment(
    organizationId: string,
    awardId: string,
    scheduleId: string,
    dto: ProposeScheduleAmendmentDto,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const award = await this.requireActiveAward(organizationId, awardId);
    const active = await this.findOne(organizationId, awardId, scheduleId);
    if (active.status !== MilestoneScheduleStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Only the active schedule can be amended',
        ErrorCode.BIZ_SCHOLARSHIP_AMENDMENT_INVALID,
      );
    }

    const milestones = this.allocateOrThrow(award, dto);
    await this.assertLockedMilestonesPreserved(active, milestones);

    let amendment: MilestoneScheduleDocument;
    try {
      amendment = await new this.scheduleModel({
        organizationId,
        awardId,
        version: await this.nextVersion(awardId),
        status: MilestoneScheduleStatus.PENDING_AMENDMENT,
        totalAmountMinor: award.totalAmountMinor,
        currency: award.currency,
        milestones,
        createdBy: actor.userId,
        amendsScheduleId: active.id,
        amendmentReason: dto.reason,
      }).save();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'An amendment is already pending for this award',
        );
      }
      throw err;
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_SCHEDULE_AMENDMENT_PROPOSED,
      context: actor.audit,
      target: { type: TARGET_TYPE, id: amendment.id },
      before: scheduleAudit(active),
      after: scheduleAudit(amendment),
      reason: dto.reason,
    });
    return amendment;
  }

  async decideAmendment(
    organizationId: string,
    awardId: string,
    amendmentId: string,
    dto: DecideScheduleAmendmentDto,
    actor: ScholarshipActor,
  ): Promise<MilestoneScheduleDocument> {
    const amendment = await this.findOne(organizationId, awardId, amendmentId);
    if (amendment.status !== MilestoneScheduleStatus.PENDING_AMENDMENT) {
      throw new ResourceConflictException(
        `Amendment is ${amendment.status}, not pending`,
      );
    }
    if (amendment.createdBy === actor.userId) {
      throw new ForbiddenDomainException(
        'An amendment must be decided by someone other than its proposer',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    const decisionFields = {
      amendmentDecidedBy: actor.userId,
      amendmentDecidedAt: new Date(),
      amendmentDecisionNote: dto.note ?? null,
    };

    if (dto.decision === 'reject') {
      const rejected = await this.transition(
        amendmentId,
        MilestoneScheduleStatus.PENDING_AMENDMENT,
        { status: MilestoneScheduleStatus.REJECTED, ...decisionFields },
      );
      await this.auditService.record({
        action: AuditAction.SCHOLARSHIP_SCHEDULE_AMENDMENT_REJECTED,
        context: actor.audit,
        target: { type: TARGET_TYPE, id: rejected.id },
        reason: dto.note ?? null,
      });
      return rejected;
    }

    await this.requireActiveAward(organizationId, awardId);
    const current = await this.findOne(
      organizationId,
      awardId,
      amendment.amendsScheduleId!,
    );
    if (current.status !== MilestoneScheduleStatus.ACTIVE) {
      throw new ResourceConflictException(
        'The schedule this amendment targets is no longer active',
        ErrorCode.BIZ_SCHOLARSHIP_AMENDMENT_INVALID,
      );
    }
    // Progress may have moved since the proposal; re-check the locks now.
    await this.assertLockedMilestonesPreserved(current, amendment.milestones);

    // No multi-document transaction is assumed (standalone Mongo is
    // supported), so swap in two compare-and-set steps and roll back the first
    // if the second loses a race.
    const now = new Date();
    await this.transition(current.id, MilestoneScheduleStatus.ACTIVE, {
      status: MilestoneScheduleStatus.SUPERSEDED,
      supersededAt: now,
      supersededByScheduleId: amendment.id,
    });

    let activated: MilestoneScheduleDocument;
    try {
      activated = await this.transition(
        amendmentId,
        MilestoneScheduleStatus.PENDING_AMENDMENT,
        {
          status: MilestoneScheduleStatus.ACTIVE,
          activatedAt: now,
          activatedBy: actor.userId,
          ...decisionFields,
        },
      );
    } catch (err) {
      await this.scheduleModel
        .updateOne(
          { _id: current.id, status: MilestoneScheduleStatus.SUPERSEDED },
          {
            $set: {
              status: MilestoneScheduleStatus.ACTIVE,
              supersededAt: null,
              supersededByScheduleId: null,
            },
          },
        )
        .exec();
      throw err;
    }

    await this.syncProgressAfterAmendment(current, activated);

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_SCHEDULE_AMENDMENT_APPROVED,
      context: actor.audit,
      target: { type: TARGET_TYPE, id: activated.id },
      before: scheduleAudit(current),
      after: scheduleAudit(activated),
      reason: amendment.amendmentReason,
    });
    return activated;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async requireActiveAward(
    organizationId: string,
    awardId: string,
  ): Promise<ScholarshipAwardDocument> {
    const award = await this.access.requireAward(organizationId, awardId);
    if (award.status !== ScholarshipAwardStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Award is not active',
        ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_INVALID,
      );
    }
    return award;
  }

  private allocateOrThrow(
    award: ScholarshipAwardDocument,
    dto: {
      milestones: (Omit<MilestoneDefinitionDto, 'description'> & {
        description?: string | null;
      })[];
    },
  ): AllocatedMilestone[] {
    const { milestones, errors } = allocateSchedule(
      {
        totalAmountMinor: award.totalAmountMinor,
        periodStart: award.periodStart,
        periodEnd: award.periodEnd,
      },
      dto.milestones.map((m) => ({
        key: m.key,
        type: m.type,
        title: m.title,
        description: m.description ?? undefined,
        percentageBps: m.percentageBps,
        amountMinor: m.amountMinor,
        dueDate: new Date(m.dueDate),
      })),
    );
    if (errors.length > 0) {
      throw new BusinessRuleException(
        errors.join('; '),
        ErrorCode.BIZ_SCHOLARSHIP_SCHEDULE_INVALID,
      );
    }
    return milestones;
  }

  /**
   * A milestone with evidence under review or a decision is locked: the new
   * plan must keep it with identical key, type, percentage and amount.
   */
  private async assertLockedMilestonesPreserved(
    active: MilestoneSchedule,
    proposed: Pick<
      AllocatedMilestone,
      'key' | 'type' | 'amountMinor' | 'percentageBps'
    >[],
  ): Promise<void> {
    const locked = await this.progressModel
      .find({
        awardId: active.awardId,
        milestoneKey: { $in: active.milestones.map((m) => m.key) },
        status: { $in: LOCKED_MILESTONE_STATUSES },
      })
      .exec();

    const violations: string[] = [];
    for (const progress of locked) {
      const original = active.milestones.find(
        (m) => m.key === progress.milestoneKey,
      )!;
      const replacement = proposed.find((m) => m.key === progress.milestoneKey);
      if (!replacement || !sameMilestoneTerms(original, replacement)) {
        violations.push(
          `Milestone "${progress.milestoneKey}" is ${progress.status} and must be kept unchanged`,
        );
      }
    }
    if (violations.length > 0) {
      throw new BusinessRuleException(
        violations.join('; '),
        ErrorCode.BIZ_SCHOLARSHIP_AMENDMENT_INVALID,
      );
    }
  }

  private async transition(
    scheduleId: string,
    from: MilestoneScheduleStatus,
    set: Partial<MilestoneSchedule>,
  ): Promise<MilestoneScheduleDocument> {
    let updated: MilestoneScheduleDocument | null;
    try {
      updated = await this.scheduleModel
        .findOneAndUpdate(
          { _id: scheduleId, status: from },
          { $set: set },
          { new: true },
        )
        .exec();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ResourceConflictException(
          'Award already has an active schedule',
        );
      }
      throw err;
    }
    if (!updated) {
      throw new ResourceConflictException(
        'Schedule was changed concurrently; reload and retry',
      );
    }
    return updated;
  }

  private async nextVersion(awardId: string): Promise<number> {
    const latest = await this.scheduleModel
      .findOne({ awardId })
      .sort({ version: -1 })
      .select('version')
      .lean()
      .exec();
    return (latest?.version ?? 0) + 1;
  }

  private async seedProgress(schedule: MilestoneSchedule): Promise<void> {
    if (schedule.milestones.length === 0) return;
    await this.progressModel.bulkWrite(
      schedule.milestones.map((m) => ({
        updateOne: {
          filter: { awardId: schedule.awardId, milestoneKey: m.key },
          update: {
            $setOnInsert: {
              organizationId: schedule.organizationId,
              awardId: schedule.awardId,
              milestoneKey: m.key,
              status: MilestoneProgressStatus.PENDING,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  private async syncProgressAfterAmendment(
    previous: MilestoneSchedule,
    next: MilestoneSchedule,
  ): Promise<void> {
    await this.seedProgress(next);

    const nextKeys = new Set(next.milestones.map((m) => m.key));
    const removed = previous.milestones
      .map((m) => m.key)
      .filter((key) => !nextKeys.has(key));
    if (removed.length === 0) return;

    // Decided milestones were rejected above; anything still open is withdrawn.
    const result = await this.progressModel
      .updateMany(
        {
          awardId: next.awardId,
          milestoneKey: { $in: removed },
          status: {
            $in: [
              MilestoneProgressStatus.PENDING,
              MilestoneProgressStatus.EVIDENCE_SUBMITTED,
              MilestoneProgressStatus.CHANGES_REQUESTED,
            ],
          },
        },
        { $set: { status: MilestoneProgressStatus.WITHDRAWN } },
      )
      .exec();
    this.logger.log(
      `Amendment ${next.version} on award ${next.awardId} withdrew ${result.modifiedCount} milestone(s)`,
    );
  }
}
