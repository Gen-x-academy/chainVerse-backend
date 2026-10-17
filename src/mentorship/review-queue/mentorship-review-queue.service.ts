import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ForbiddenDomainException,
} from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import { assertSafeText } from '../shared/safe-text';
import { MentorshipAccessPolicy } from '../shared/mentorship-access.policy';
import { MentorshipAuditService } from '../shared/audit/mentorship-audit.service';
import { MentorshipRequestContext, MentorshipUser } from '../shared/mentorship-context';
import { conflict, staleVersion } from '../shared/mentorship-errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  ProgramReviewer,
  ProgramReviewerDocument,
} from '../programs/schemas/program-reviewer.schema';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
  OPEN_STATUSES,
  PRIORITY_RANK,
} from '../applications/schemas/mentorship-application.schema';
import { MentorshipApplicationsService } from '../applications/mentorship-applications.service';
import {
  ConflictDeclaration,
  ConflictDeclarationDocument,
} from './schemas/conflict-declaration.schema';
import { cursorFilter, encodeCursor, filterFingerprint, mongoSort } from './domain/queue-cursor';
import {
  AssignDto,
  ConflictDeclarationDto,
  DecisionDto,
  QueueQueryDto,
  TriageDto,
  UnassignDto,
} from './dto/review-queue.dto';

type ApplicationRecord = MentorshipApplication & { _id: unknown };

/**
 * Review queues for mentorship applications (MENTOR-034).
 *
 * Concurrency model:
 * - Every mutation is a single conditional `findOneAndUpdate` on the
 *   application guarded by `version` (optimistic concurrency) plus the
 *   invariants it relies on (not decided, assignee unchanged, no conflict).
 * - Reviewer capacity is reserved with an atomic conditional `$inc`
 *   (`activeAssignments < capacity`) *before* the application update and
 *   released if that update loses the race – so two concurrent claims can
 *   never both succeed or over-commit a reviewer.
 * - Repeating an action whose effect is already in place (same assignee,
 *   same decision, same declaration) is a no-op that returns current state.
 */
@Injectable()
export class MentorshipReviewQueueService {
  constructor(
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
    @InjectModel(ProgramReviewer.name)
    private readonly reviewerModel: Model<ProgramReviewerDocument>,
    @InjectModel(ConflictDeclaration.name)
    private readonly conflictModel: Model<ConflictDeclarationDocument>,
    private readonly applications: MentorshipApplicationsService,
    private readonly policy: MentorshipAccessPolicy,
    private readonly audit: MentorshipAuditService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly events: EventEmitter2,
  ) {}

  // ── Queue listing ──────────────────────────────────────────────────────────

  async list(ctx: MentorshipRequestContext, q: QueueQueryDto) {
    const { user } = ctx;
    const sort = q.sort ?? 'priority';
    const limit = q.limit ?? 25;
    const scope = await this.policy.queueScope(user);

    let programIds: string[] | null = scope;
    if (q.programId) {
      if (scope && !scope.includes(q.programId)) this.policy.deny('queue_scope');
      programIds = [q.programId];
    }
    if (programIds && programIds.length === 0) {
      return { items: [], nextCursor: null, sort, limit };
    }

    const filter: Record<string, unknown> = {};
    if (programIds) filter.programId = { $in: programIds.map((id) => new Types.ObjectId(id)) };
    filter.status = !q.status || q.status === 'open' ? { $in: OPEN_STATUSES } : q.status;
    if (q.priority?.length) filter['review.priority'] = { $in: q.priority };

    const assignee = q.assignee ?? 'any';
    if (assignee === 'me') filter['review.assigneeId'] = user.id;
    else if (assignee === 'unassigned') filter['review.assigneeId'] = null;
    else if (assignee !== 'any' && assignee !== user.id) {
      // Looking at someone else's assignments is a lead capability.
      if (!this.policy.isAdmin(user)) {
        if (!q.programId) this.policy.deny('queue_assignee_filter', 'Filtering by another reviewer requires programId');
        const program = await this.policy.loadProgram(q.programId!);
        if (!(await this.policy.canLeadQueue(user, program))) this.policy.deny('queue_assignee_filter');
      }
      filter['review.assigneeId'] = assignee;
    } else if (assignee === user.id) {
      filter['review.assigneeId'] = user.id;
    }

    const now = new Date();
    const due: Record<string, Date> = {};
    if (q.dueBefore) due.$lt = q.dueBefore;
    if (q.overdue === true) due.$lt = due.$lt && due.$lt < now ? due.$lt : now;
    if (q.overdue === false) due.$gte = now;
    if (Object.keys(due).length) filter['review.dueAt'] = due;
    if (q.overdue === true) filter['review.decision'] = null;

    if (q.coi === 'cleared') filter['review.clearedReviewerIds'] = user.id;
    if (q.coi === 'conflicted') filter['review.conflictedReviewerIds'] = user.id;
    if (q.coi === 'undeclared') {
      filter['review.clearedReviewerIds'] = { $ne: user.id };
      filter['review.conflictedReviewerIds'] = { $ne: user.id };
    }

    // The cursor is bound to the viewer, sort and every filter except paging.
    const fingerprint = filterFingerprint({ ...q, cursor: undefined, limit: undefined, viewer: user.id, sort });
    const query = q.cursor ? { $and: [filter, cursorFilter(q.cursor, sort, fingerprint)] } : filter;

    const docs = await this.applicationModel
      .find(query, { answers: 0 })
      .sort(mongoSort(sort))
      .limit(limit + 1)
      .lean()
      .exec();

    const page = docs.slice(0, limit);
    const nextCursor = docs.length > limit ? encodeCursor(sort, fingerprint, page[page.length - 1]) : null;
    this.telemetry.count('mentorship_review_queue_reads_total', { sort });

    return { items: page.map((a) => this.queueItem(a, user, now)), nextCursor, sort, limit };
  }

  // ── Workload ───────────────────────────────────────────────────────────────

  async workload(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    const lead = await this.policy.canLeadQueue(ctx.user, program);
    const self = await this.policy.activeMembership(programId, ctx.user.id);
    if (!lead && !self) this.policy.deny('workload');

    type ReviewerRow = Pick<ProgramReviewer, 'reviewerId' | 'role' | 'capacity' | 'activeAssignments'>;
    const reviewers: ReviewerRow[] = lead
      ? await this.reviewerModel.find({ programId, active: true }).sort({ reviewerId: 1 }).lean().exec()
      : [self!.toObject()];

    const now = new Date();
    const pid = new Types.ObjectId(programId);
    const [overdueByReviewer, unassigned] = await Promise.all([
      this.applicationModel
        .aggregate<{ _id: string; overdue: number }>([
          {
            $match: {
              programId: pid,
              status: { $in: OPEN_STATUSES },
              'review.assigneeId': { $in: reviewers.map((r) => r.reviewerId) },
              'review.dueAt': { $lt: now },
            },
          },
          { $group: { _id: '$review.assigneeId', overdue: { $sum: 1 } } },
        ])
        .exec(),
      lead
        ? this.applicationModel
            .aggregate<{ open: number; overdue: number }>([
              { $match: { programId: pid, status: { $in: OPEN_STATUSES }, 'review.assigneeId': null } },
              {
                $group: {
                  _id: null,
                  open: { $sum: 1 },
                  overdue: { $sum: { $cond: [{ $lt: ['$review.dueAt', now] }, 1, 0] } },
                },
              },
            ])
            .exec()
        : Promise.resolve([]),
    ]);

    const overdue = new Map<string, number>(overdueByReviewer.map((o) => [o._id, o.overdue] as [string, number]));
    return {
      programId,
      generatedAt: now,
      reviewers: reviewers.map((r) => ({
        reviewerId: r.reviewerId,
        role: r.role,
        capacity: r.capacity,
        activeAssignments: r.activeAssignments,
        availableSlots: Math.max(0, r.capacity - r.activeAssignments),
        overdueAssignments: overdue.get(r.reviewerId) ?? 0,
        utilization: r.capacity > 0 ? +(r.activeAssignments / r.capacity).toFixed(2) : null,
      })),
      ...(lead && { unassigned: { open: unassigned[0]?.open ?? 0, overdue: unassigned[0]?.overdue ?? 0 } }),
    };
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  async assign(ctx: MentorshipRequestContext, applicationId: string, dto: AssignDto) {
    const { user } = ctx;
    const app = await this.applications.load(applicationId);
    const programId = String(app.programId);
    const program = await this.policy.loadProgram(programId);
    const targetId = dto.assigneeId ?? user.id;
    const isLead = await this.policy.canLeadQueue(user, program);

    if (targetId !== user.id && !isLead) this.policy.deny('assign_others', 'Only leads, owners and admins may assign others');
    if (!isLead && !(await this.policy.activeMembership(programId, user.id))) this.policy.deny('assign');

    const target = await this.policy.activeMembership(programId, targetId);
    if (!target) {
      throw new BusinessRuleException('The assignee is not an active reviewer of this program', ErrorCode.MENTOR_NOT_A_REVIEWER);
    }

    if (app.review.assigneeId === targetId) return this.result(app, user, 'noop');
    this.assertOpen(app);
    if (app.review.conflictedReviewerIds.includes(targetId)) {
      throw conflict('The assignee declared a conflict of interest for this application', ErrorCode.MENTOR_CONFLICT_OF_INTEREST);
    }
    if (app.version !== dto.expectedVersion) throw this.assignmentConflict(app);

    // 1. Reserve capacity atomically.
    const reserved = await this.reviewerModel
      .findOneAndUpdate(
        { programId, reviewerId: targetId, active: true, $expr: { $lt: ['$activeAssignments', '$capacity'] } },
        { $inc: { activeAssignments: 1 } },
      )
      .exec();
    if (!reserved) {
      this.telemetry.count('mentorship_review_actions_total', { action: 'assign', result: 'at_capacity' });
      throw conflict('The reviewer has no free capacity', ErrorCode.MENTOR_REVIEWER_AT_CAPACITY, {
        capacity: target.capacity,
        activeAssignments: target.activeAssignments,
      });
    }

    // 2. Compare-and-set the application.
    const now = new Date();
    const before = await this.applicationModel
      .findOneAndUpdate(
        {
          _id: app._id,
          version: dto.expectedVersion,
          status: { $in: OPEN_STATUSES },
          'review.decision': null,
          'review.conflictedReviewerIds': { $ne: targetId },
        },
        {
          $set: {
            status: 'in_review',
            'review.assigneeId': targetId,
            'review.assignedAt': now,
            'review.assignedBy': user.id,
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'before' },
      )
      .lean()
      .exec();

    if (!before) {
      await this.release(programId, targetId);
      const latest = await this.applications.load(applicationId);
      if (latest.review.assigneeId === targetId) return this.result(latest, user, 'noop');
      this.telemetry.count('mentorship_review_actions_total', { action: 'assign', result: 'conflict' });
      throw this.assignmentConflict(latest);
    }

    // 3. Release the previous assignee's slot on reassignment.
    const previous = before.review.assigneeId;
    if (previous && previous !== targetId) await this.release(programId, previous);

    const after = await this.applications.load(applicationId);
    await this.audit.record(ctx, {
      action: previous ? 'review.reassigned' : 'review.assigned',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: { from: previous ?? null, to: targetId, version: after.version },
      dedupeKey: `review.assign:${applicationId}:${after.version}`,
    });
    this.telemetry.count('mentorship_review_actions_total', { action: previous ? 'reassign' : 'assign', result: 'ok' });
    this.events.emit(DomainEvents.MENTORSHIP_REVIEW_ASSIGNED, {
      applicationId,
      programId,
      assigneeId: targetId,
      previousAssigneeId: previous ?? null,
    });
    return this.result(after, user, 'updated');
  }

  async unassign(ctx: MentorshipRequestContext, applicationId: string, dto: UnassignDto) {
    const { user } = ctx;
    const app = await this.applications.load(applicationId);
    const programId = String(app.programId);
    const program = await this.policy.loadProgram(programId);
    const current = app.review.assigneeId;

    const isLead = await this.policy.canLeadQueue(user, program);
    if (!isLead && current !== user.id) this.policy.deny('unassign');
    if (!current) return this.result(app, user, 'noop');
    this.assertOpen(app);

    const updated = await this.applicationModel
      .findOneAndUpdate(
        { _id: app._id, version: dto.expectedVersion, 'review.assigneeId': current, 'review.decision': null },
        {
          $set: { status: 'submitted', 'review.assigneeId': null, 'review.assignedAt': null, 'review.assignedBy': null },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) {
      const latest = await this.applications.load(applicationId);
      if (!latest.review.assigneeId) return this.result(latest, user, 'noop');
      throw this.assignmentConflict(latest);
    }

    await this.release(programId, current);
    await this.audit.record(ctx, {
      action: 'review.unassigned',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: { from: current, version: updated.version },
      dedupeKey: `review.unassign:${applicationId}:${updated.version}`,
    });
    this.telemetry.count('mentorship_review_actions_total', { action: 'unassign', result: 'ok' });
    this.events.emit(DomainEvents.MENTORSHIP_REVIEW_ASSIGNED, {
      applicationId,
      programId,
      assigneeId: null,
      previousAssigneeId: current,
    });
    return this.result(updated, user, 'updated');
  }

  // ── Triage (priority / due date) ───────────────────────────────────────────

  async triage(ctx: MentorshipRequestContext, applicationId: string, dto: TriageDto) {
    const app = await this.applications.load(applicationId);
    const programId = String(app.programId);
    const program = await this.policy.loadProgram(programId);
    if (!(await this.policy.canLeadQueue(ctx.user, program))) this.policy.deny('triage');
    this.assertOpen(app);

    const samePriority = !dto.priority || dto.priority === app.review.priority;
    const sameDue = !dto.dueAt || dto.dueAt.getTime() === new Date(app.review.dueAt).getTime();
    if (samePriority && sameDue) return this.result(app, ctx.user, 'noop');

    const set: Record<string, unknown> = {};
    if (dto.priority) {
      set['review.priority'] = dto.priority;
      set['review.priorityRank'] = PRIORITY_RANK[dto.priority];
    }
    if (dto.dueAt) {
      set['review.dueAt'] = dto.dueAt;
      // Re-arm the overdue notification when the deadline moves.
      set['review.overdueNotifiedAt'] = null;
    }

    const updated = await this.applicationModel
      .findOneAndUpdate(
        { _id: app._id, version: dto.expectedVersion, 'review.decision': null },
        { $set: set, $inc: { version: 1 } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!updated) {
      const latest = await this.applications.load(applicationId);
      throw staleVersion('The application changed; reload and retry', { currentVersion: latest.version });
    }

    await this.audit.record(ctx, {
      action: 'review.triaged',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: {
        priority: { from: app.review.priority, to: updated.review.priority },
        dueAt: { from: app.review.dueAt, to: updated.review.dueAt },
        version: updated.version,
      },
      dedupeKey: `review.triage:${applicationId}:${updated.version}`,
    });
    this.telemetry.count('mentorship_review_actions_total', { action: 'triage', result: 'ok' });
    return this.result(updated, ctx.user, 'updated');
  }

  // ── Conflict of interest ───────────────────────────────────────────────────

  async declareConflict(ctx: MentorshipRequestContext, applicationId: string, dto: ConflictDeclarationDto) {
    const { user } = ctx;
    const app = await this.applications.load(applicationId);
    const programId = String(app.programId);
    if (!(await this.policy.activeMembership(programId, user.id))) {
      this.policy.deny('declare_conflict', 'Only scoped reviewers of this program can declare conflicts');
    }
    this.assertOpen(app);

    const reason = dto.hasConflict ? dto.reason!.trim() : null;
    assertSafeText([{ field: 'reason', value: reason }]);

    const existing = await this.conflictModel.findOne({ applicationId: app._id, reviewerId: user.id }).lean().exec();
    if (existing && existing.hasConflict === dto.hasConflict && (existing.reason ?? null) === reason) {
      return { applicationId, hasConflict: existing.hasConflict, declaredAt: existing.declaredAt, autoUnassigned: false, result: 'noop' };
    }

    const declaredAt = new Date();
    await this.conflictModel
      .updateOne(
        { applicationId: app._id, reviewerId: user.id },
        { $set: { hasConflict: dto.hasConflict, reason, declaredAt, programId } },
        { upsert: true },
      )
      .exec();

    await this.applicationModel
      .updateOne(
        { _id: app._id, 'review.decision': null },
        {
          ...(dto.hasConflict
            ? { $addToSet: { 'review.conflictedReviewerIds': user.id }, $pull: { 'review.clearedReviewerIds': user.id } }
            : { $addToSet: { 'review.clearedReviewerIds': user.id }, $pull: { 'review.conflictedReviewerIds': user.id } }),
          $inc: { version: 1 },
        },
      )
      .exec();

    // A conflicted assignee must not keep the application.
    let autoUnassigned = false;
    if (dto.hasConflict) {
      const released = await this.applicationModel
        .findOneAndUpdate(
          { _id: app._id, 'review.assigneeId': user.id, 'review.decision': null },
          {
            $set: { status: 'submitted', 'review.assigneeId': null, 'review.assignedAt': null, 'review.assignedBy': null },
            $inc: { version: 1 },
          },
        )
        .exec();
      if (released) {
        autoUnassigned = true;
        await this.release(programId, user.id);
      }
    }

    // Privacy: the reason is never written to the audit log or telemetry.
    await this.audit.record(ctx, {
      action: 'review.conflict_declared',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: { hasConflict: dto.hasConflict, autoUnassigned, changedFrom: existing?.hasConflict ?? null },
    });
    this.telemetry.count('mentorship_review_actions_total', {
      action: 'declare_conflict',
      result: dto.hasConflict ? 'conflicted' : 'cleared',
    });
    if (autoUnassigned) {
      this.events.emit(DomainEvents.MENTORSHIP_REVIEW_ASSIGNED, {
        applicationId,
        programId,
        assigneeId: null,
        previousAssigneeId: user.id,
      });
    }
    return { applicationId, hasConflict: dto.hasConflict, declaredAt, autoUnassigned, result: 'updated' };
  }

  // ── Decision ───────────────────────────────────────────────────────────────

  async decide(ctx: MentorshipRequestContext, applicationId: string, dto: DecisionDto) {
    const { user } = ctx;
    const app = await this.applications.load(applicationId);
    const programId = String(app.programId);

    const existing = app.review.decision;
    if (existing) {
      if (existing.decidedBy === user.id && existing.outcome === dto.outcome) return this.result(app, user, 'noop');
      throw conflict('A decision has already been recorded for this application', ErrorCode.MENTOR_ALREADY_DECIDED);
    }
    this.assertOpen(app);
    if (!(await this.policy.activeMembership(programId, user.id))) this.policy.deny('decide');
    if (app.review.assigneeId !== user.id) {
      throw new ForbiddenDomainException('Only the assigned reviewer can record a decision', ErrorCode.MENTOR_NOT_ASSIGNEE);
    }
    this.assertConflictCleared(app, user);
    assertSafeText([{ field: 'note', value: dto.note }]);

    const decision = {
      outcome: dto.outcome,
      note: dto.note?.trim() || null,
      decidedBy: user.id,
      decidedAt: new Date(),
    };

    const updated = await this.applicationModel
      .findOneAndUpdate(
        {
          _id: app._id,
          version: dto.expectedVersion,
          status: { $in: OPEN_STATUSES },
          'review.decision': null,
          'review.assigneeId': user.id,
          'review.clearedReviewerIds': user.id,
          'review.conflictedReviewerIds': { $ne: user.id },
        },
        { $set: { status: 'decided', 'review.decision': decision }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) {
      const latest = await this.applications.load(applicationId);
      const d = latest.review.decision;
      if (d && d.decidedBy === user.id && d.outcome === dto.outcome) return this.result(latest, user, 'noop');
      if (d) throw conflict('A decision has already been recorded for this application', ErrorCode.MENTOR_ALREADY_DECIDED);
      if (latest.review.assigneeId !== user.id) {
        throw new ForbiddenDomainException('Only the assigned reviewer can record a decision', ErrorCode.MENTOR_NOT_ASSIGNEE);
      }
      this.assertConflictCleared(latest, user);
      throw staleVersion('The application changed; reload and retry', { currentVersion: latest.version });
    }

    await this.release(programId, user.id);
    await this.audit.record(ctx, {
      action: 'review.decided',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: { outcome: dto.outcome, version: updated.version },
      dedupeKey: `review.decided:${applicationId}`,
    });
    this.telemetry.count('mentorship_review_actions_total', { action: 'decide', result: dto.outcome });
    this.events.emit(DomainEvents.MENTORSHIP_REVIEW_DECIDED, {
      applicationId,
      programId,
      applicantId: updated.applicantId,
      outcome: dto.outcome,
      decidedBy: user.id,
    });
    return this.result(updated, user, 'updated');
  }

  // ── Audit history ──────────────────────────────────────────────────────────

  async history(ctx: MentorshipRequestContext, applicationId: string) {
    const app = await this.applications.load(applicationId);
    const program = await this.policy.loadProgram(String(app.programId));
    if (!(await this.policy.canLeadQueue(ctx.user, program))) this.policy.deny('audit_history');
    const events = await this.audit.listForSubject('application', applicationId, 500);
    return events.map((e) => ({
      action: e.action,
      actorId: e.actorId,
      actorRole: e.actorRole,
      at: e.createdAt,
      requestId: e.requestId,
      metadata: e.metadata,
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async release(programId: string, reviewerId: string): Promise<void> {
    await this.reviewerModel
      .updateOne({ programId, reviewerId, activeAssignments: { $gt: 0 } }, { $inc: { activeAssignments: -1 } })
      .exec();
  }

  private assertOpen(app: ApplicationRecord): void {
    if (app.review.decision || !OPEN_STATUSES.includes(app.status)) {
      throw conflict('This application is no longer open for review', ErrorCode.MENTOR_ALREADY_DECIDED);
    }
  }

  private assertConflictCleared(app: ApplicationRecord, user: MentorshipUser): void {
    if (app.review.conflictedReviewerIds.includes(user.id)) {
      throw conflict('You declared a conflict of interest and cannot decide this application', ErrorCode.MENTOR_CONFLICT_OF_INTEREST);
    }
    if (!app.review.clearedReviewerIds.includes(user.id)) {
      throw conflict(
        'Declare that you have no conflict of interest before recording a decision',
        ErrorCode.MENTOR_COI_DECLARATION_REQUIRED,
      );
    }
  }

  private assignmentConflict(app: ApplicationRecord) {
    return conflict('The application was changed by someone else; reload and retry', ErrorCode.MENTOR_ASSIGNMENT_CONFLICT, {
      currentVersion: app.version,
      assigneeId: app.review.assigneeId,
    });
  }

  private result(app: ApplicationRecord, user: MentorshipUser, result: 'noop' | 'updated') {
    return { ...this.queueItem(app, user, new Date()), result };
  }

  /** Queue row: metadata only, never answers. Applicant id is hidden from conflicted reviewers. */
  private queueItem(a: ApplicationRecord, user: MentorshipUser, now: Date) {
    const r = a.review;
    const conflicted = r.conflictedReviewerIds.includes(user.id);
    return {
      id: String(a._id),
      programId: String(a.programId),
      applicantId: conflicted ? null : a.applicantId,
      status: a.status,
      priority: r.priority,
      dueAt: r.dueAt,
      overdue: !r.decision && new Date(r.dueAt) < now,
      submittedAt: a.submittedAt,
      assigneeId: r.assigneeId,
      assignedToMe: r.assigneeId === user.id,
      myConflictStatus: conflicted ? 'conflicted' : r.clearedReviewerIds.includes(user.id) ? 'cleared' : 'undeclared',
      decision: r.decision ? { outcome: r.decision.outcome, decidedBy: r.decision.decidedBy, decidedAt: r.decision.decidedAt } : null,
      version: a.version,
    };
  }
}
