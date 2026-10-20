import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OPEN_APPLICATION_STATUSES,
  ApplicationRead,
} from '../schemas/application-read.schema';
import {
  EngagementStatus,
  OPEN_PROPOSAL_STATUSES,
  ParticipantRole,
} from '../../mentorship.constants';
import type { MentorshipActor } from '../../mentorship.policy';
import { MatchProposal } from '../../schemas/match-proposal.schema';
import { MentorshipEngagement } from '../../schemas/mentorship-engagement.schema';
import { MentorshipProfile } from '../../schemas/mentorship-profile.schema';
import {
  Cohort,
  CohortEnrollment,
} from '../../programs/schemas/program.schema';
import {
  CoordinatorDashboardQueryDto,
  CoordinatorQueueQueryDto,
  SaveDashboardFiltersDto,
} from '../dto/mentorship-operations-query.dto';
import {
  CoordinatorQueue,
  DashboardScope,
  DisputeStatus,
  InterventionType,
  JobRunStatus,
  MilestoneStatus,
  OpsJob,
  OpsSessionStatus,
} from '../enums/mentorship-operations.enums';
import { MentorshipDashboardFilter } from '../schemas/mentorship-dashboard-filter.schema';
import { MentorshipOpsDispute } from '../schemas/mentorship-ops-dispute.schema';
import { MentorshipIntervention } from '../schemas/mentorship-intervention.schema';
import { MentorshipOpsMilestone } from '../schemas/mentorship-ops-milestone.schema';
import { MentorshipOpsJobRun } from '../schemas/mentorship-ops-job-run.schema';
import { MentorshipSession } from '../schemas/mentorship-session.schema';
import { counterpartRef } from '../shared/mentorship-ops-privacy';

const DEFAULT_WINDOW_HOURS = 72;
const SCHEDULE_RISK_HOURS = 48;

/** Relative API paths (prefix included) so aggregates always link out. */
const QUEUE_LINKS: Record<CoordinatorQueue, string> = {
  [CoordinatorQueue.ELIGIBILITY_REVIEW]:
    '/api/v1/mentorship/coordinator/queues/eligibility_review',
  [CoordinatorQueue.EXPIRING_PROPOSALS]:
    '/api/v1/mentorship/coordinator/queues/expiring_proposals',
  [CoordinatorQueue.UNMATCHED_PARTICIPANTS]:
    '/api/v1/mentorship/coordinator/queues/unmatched_participants',
  [CoordinatorQueue.SCHEDULE_RISKS]:
    '/api/v1/mentorship/coordinator/queues/schedule_risks',
  [CoordinatorQueue.OVERDUE_MILESTONES]:
    '/api/v1/mentorship/coordinator/queues/overdue_milestones',
  [CoordinatorQueue.DISPUTES]: '/api/v1/mentorship/coordinator/queues/disputes',
};

/**
 * Coordinator operations dashboard (MENTOR-116 / issue #1434).
 *
 * Card permissions are declared per card and per action in the payload
 * (`permissions`), job-derived cards carry freshness/stale flags from the
 * ops job-run ledger, every aggregate links to the queue endpoint that
 * lists the matching records, and filters persist per user while explicit
 * query parameters always win.
 */
@Injectable()
export class CoordinatorDashboardService {
  constructor(
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfile>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagement>,
    @InjectModel(Cohort.name)
    private readonly cohortModel: Model<Cohort>,
    @InjectModel(CohortEnrollment.name)
    private readonly enrollmentModel: Model<CohortEnrollment>,
    @InjectModel(ApplicationRead.name)
    private readonly applicationModel: Model<ApplicationRead>,
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposal>,
    @InjectModel(MentorshipSession.name)
    private readonly sessionModel: Model<MentorshipSession>,
    @InjectModel(MentorshipOpsMilestone.name)
    private readonly milestoneModel: Model<MentorshipOpsMilestone>,
    @InjectModel(MentorshipOpsDispute.name)
    private readonly disputeModel: Model<MentorshipOpsDispute>,
    @InjectModel(MentorshipIntervention.name)
    private readonly interventionModel: Model<MentorshipIntervention>,
    @InjectModel(MentorshipDashboardFilter.name)
    private readonly filterModel: Model<MentorshipDashboardFilter>,
    @InjectModel(MentorshipOpsJobRun.name)
    private readonly jobRunModel: Model<MentorshipOpsJobRun>,
  ) {}

  private async jobFreshness(): Promise<
    Record<
      OpsJob,
      {
        lastFinishedAt: Date | null;
        status: JobRunStatus | null;
        stale: boolean;
      }
    >
  > {
    const staleAfterMs =
      Number(process.env.MENTORSHIP_OPS_FRESHNESS_MINUTES || 30) * 60 * 1000;
    const rows = await this.jobRunModel
      .aggregate([
        { $sort: { startedAt: -1 } },
        { $group: { _id: '$job', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ])
      .exec();
    const result = {} as Record<
      OpsJob,
      {
        lastFinishedAt: Date | null;
        status: JobRunStatus | null;
        stale: boolean;
      }
    >;
    for (const job of Object.values(OpsJob)) {
      const row = rows.find((r: { job: OpsJob }) => r.job === job);
      const finishedAt = row?.finishedAt ? new Date(row.finishedAt) : null;
      result[job] = {
        lastFinishedAt: finishedAt,
        status: (row?.status as JobRunStatus) ?? null,
        stale:
          finishedAt === null ||
          Date.now() - finishedAt.getTime() > staleAfterMs,
      };
    }
    return result;
  }

  /** Saved filters win only when the request passes no filter parameters. */
  private async resolveFilters(
    userId: string,
    query: CoordinatorDashboardQueryDto,
  ): Promise<{
    programId?: string;
    cohortId?: string;
    windowHours: number;
    includeResolvedDisputes: boolean;
    source: 'query' | 'saved' | 'defaults';
  }> {
    const hasQueryFilters =
      Boolean(query.programId) ||
      Boolean(query.cohortId) ||
      typeof query.windowHours === 'number' ||
      query.includeResolvedDisputes === true;
    if (hasQueryFilters || query.ignoreSavedFilters) {
      return {
        ...(query.programId ? { programId: query.programId } : {}),
        ...(query.cohortId ? { cohortId: query.cohortId } : {}),
        windowHours: query.windowHours ?? DEFAULT_WINDOW_HOURS,
        includeResolvedDisputes: query.includeResolvedDisputes ?? false,
        source: hasQueryFilters ? 'query' : 'defaults',
      };
    }
    const saved = await this.filterModel
      .findOne({ userId, scope: DashboardScope.COORDINATOR })
      .lean();
    if (!saved) {
      return {
        windowHours: DEFAULT_WINDOW_HOURS,
        includeResolvedDisputes: false,
        source: 'defaults',
      };
    }
    return {
      ...(saved.programId ? { programId: saved.programId } : {}),
      ...(saved.cohortId ? { cohortId: saved.cohortId } : {}),
      windowHours: saved.windowHours ?? DEFAULT_WINDOW_HOURS,
      includeResolvedDisputes: Boolean(saved.includeResolvedDisputes),
      source: 'saved',
    };
  }

  private oid(programId?: string): Record<string, unknown> {
    return programId ? { programId: new Types.ObjectId(programId) } : {};
  }

  private str(programId?: string): Record<string, unknown> {
    return programId ? { programId } : {};
  }

  async dashboard(
    actor: MentorshipActor,
    query: CoordinatorDashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const filters = await this.resolveFilters(actor.userId, query);
    const programId = filters.programId;
    const now = new Date();
    const expiryHorizon = new Date(
      now.getTime() + filters.windowHours * 3600000,
    );
    const riskHorizon = new Date(now.getTime() + SCHEDULE_RISK_HOURS * 3600000);
    const freshness = await this.jobFreshness();

    const [
      capacity,
      reviewDepth,
      reviewOverdue,
      mentorOpenSlots,
      unmatchedMentees,
      expiringCount,
      expiringList,
      sweeperBacklog,
      scheduleRisks,
      milestonesOverdue,
      disputeOpen,
      disputeInReview,
      disputeResolvedRecent,
      recentInterventions,
    ] = await Promise.all([
      this.capacityCard(programId, filters.cohortId),
      this.applicationModel.countDocuments({
        ...this.oid(programId),
        status: { $in: OPEN_APPLICATION_STATUSES },
      }),
      this.applicationModel.countDocuments({
        ...this.oid(programId),
        status: { $in: OPEN_APPLICATION_STATUSES },
        'review.dueAt': { $lt: now },
      }),
      this.profileModel.countDocuments({
        kind: ParticipantRole.MENTOR,
        eligible: true,
        acceptingMentees: true,
        ...(programId ? { programIds: programId } : {}),
        $expr: { $lt: ['$reservedSlots', '$maxActiveMentees'] },
      }),
      this.unmatchedMenteeCount(programId),
      this.proposalModel.countDocuments({
        ...this.str(programId),
        status: { $in: [...OPEN_PROPOSAL_STATUSES] },
        expiresAt: { $gte: now, $lte: expiryHorizon },
      }),
      this.proposalModel
        .find({
          ...this.str(programId),
          status: { $in: [...OPEN_PROPOSAL_STATUSES] },
          expiresAt: { $gte: now, $lte: expiryHorizon },
        })
        .sort({ expiresAt: 1 })
        .limit(10)
        .select('mentorId menteeId programId expiresAt status')
        .lean(),
      this.proposalModel.countDocuments({
        ...this.str(programId),
        status: { $in: [...OPEN_PROPOSAL_STATUSES] },
        expiresAt: { $lt: now },
      }),
      this.sessionModel.countDocuments({
        ...this.str(programId),
        ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
        status: OpsSessionStatus.SCHEDULED,
        confirmed: false,
        startsAt: { $gte: now, $lte: riskHorizon },
      }),
      this.milestoneModel.countDocuments({
        ...this.str(programId),
        $or: [
          { status: MilestoneStatus.OVERDUE },
          { status: MilestoneStatus.PENDING, dueAt: { $lt: now } },
        ],
      }),
      this.disputeModel.countDocuments({
        ...this.str(programId),
        status: DisputeStatus.OPEN,
      }),
      this.disputeModel.countDocuments({
        ...this.str(programId),
        status: DisputeStatus.IN_REVIEW,
      }),
      this.disputeModel.countDocuments({
        ...this.str(programId),
        status: { $in: [DisputeStatus.RESOLVED, DisputeStatus.DISMISSED] },
        updatedAt: { $gte: new Date(now.getTime() - 30 * 86400000) },
      }),
      this.interventionModel
        .find(programId ? { programId } : {})
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const permissions = {
      roles: ['admin', 'moderator'],
      actions: {
        [InterventionType.CONTACT_PARTICIPANT]: ['admin', 'moderator'],
        [InterventionType.EXTEND_PROPOSAL_EXPIRY]: ['admin', 'moderator'],
        [InterventionType.EXPIRE_PROPOSAL]: ['admin', 'moderator'],
        [InterventionType.ESCALATE_DISPUTE]: ['admin', 'moderator'],
        [InterventionType.RESOLVE_DISPUTE]: ['admin'],
      },
      note: 'resolve_dispute is administrator-only; moderators receive 403 AUTH_INSUFFICIENT_PERMISSIONS.',
    };

    return {
      meta: {
        scope: {
          programId: programId ?? null,
          cohortId: filters.cohortId ?? null,
        },
        filterSource: filters.source,
        windowHours: filters.windowHours,
        generatedAt: now.toISOString(),
        permissions,
      },
      cards: {
        capacity: {
          ...capacity,
          queue: QUEUE_LINKS[CoordinatorQueue.UNMATCHED_PARTICIPANTS],
        },
        reviewQueues: {
          depth: reviewDepth,
          overdue: reviewOverdue,
          queue: QUEUE_LINKS[CoordinatorQueue.ELIGIBILITY_REVIEW],
        },
        unmatchedParticipants: {
          mentorsWithOpenSlots: mentorOpenSlots,
          menteesWithoutEngagement: unmatchedMentees,
          queue: QUEUE_LINKS[CoordinatorQueue.UNMATCHED_PARTICIPANTS],
        },
        expiringProposals: {
          expiringInWindow: expiringCount,
          sweeperBacklog,
          stale: freshness[OpsJob.EXPIRE_PROPOSALS].stale,
          lastSweptAt: freshness[OpsJob.EXPIRE_PROPOSALS].lastFinishedAt,
          queue: QUEUE_LINKS[CoordinatorQueue.EXPIRING_PROPOSALS],
          items: expiringList.map((p) => ({
            id: String(p._id),
            programId: p.programId,
            mentor: counterpartRef(p.mentorId),
            mentee: counterpartRef(p.menteeId),
            expiresAt: p.expiresAt,
            hoursUntilExpiry:
              Math.round(
                (new Date(p.expiresAt).getTime() - now.getTime()) / 36000,
              ) / 10,
          })),
        },
        scheduleRisks: {
          unconfirmedSessionsNext48h: scheduleRisks,
          stale: freshness[OpsJob.SCHEDULE_RISK_SWEEP].stale,
          lastSweptAt: freshness[OpsJob.SCHEDULE_RISK_SWEEP].lastFinishedAt,
          queue: QUEUE_LINKS[CoordinatorQueue.SCHEDULE_RISKS],
        },
        overdueMilestones: {
          count: milestonesOverdue,
          stale: freshness[OpsJob.MILESTONE_REMINDERS].stale,
          lastSweptAt: freshness[OpsJob.MILESTONE_REMINDERS].lastFinishedAt,
          queue: QUEUE_LINKS[CoordinatorQueue.OVERDUE_MILESTONES],
        },
        disputes: {
          open: disputeOpen,
          inReview: disputeInReview,
          resolvedLast30Days: disputeResolvedRecent,
          queue: QUEUE_LINKS[CoordinatorQueue.DISPUTES],
        },
        recentInterventions: recentInterventions.map((i) => ({
          id: String(i._id),
          type: i.type,
          targetType: i.targetType,
          targetId: i.targetId,
          actor: { userId: i.actorId, role: i.actorRole ?? null },
          reason: i.reason ?? null,
          createdAt: i.createdAt ?? null,
        })),
      },
      freshness,
    };
  }

  private async capacityCard(
    programId?: string,
    cohortId?: string,
  ): Promise<Record<string, unknown>> {
    const [mentorAgg, cohorts] = await Promise.all([
      this.profileModel.aggregate([
        {
          $match: {
            kind: ParticipantRole.MENTOR,
            ...(programId ? { programIds: programId } : {}),
          },
        },
        {
          $group: {
            _id: null,
            mentors: { $sum: 1 },
            reserved: { $sum: '$reservedSlots' },
            capacity: { $sum: '$maxActiveMentees' },
          },
        },
      ]),
      this.cohortModel
        .find({
          ...(programId ? { programId } : {}),
          ...(cohortId ? { _id: new Types.ObjectId(cohortId) } : {}),
        })
        .select('name capacity confirmedCount status')
        .limit(100)
        .lean(),
    ]);
    const mentors = mentorAgg[0] as
      | { mentors: number; reserved: number; capacity: number }
      | undefined;
    const cohortCapacity = cohorts.reduce((sum, c) => sum + c.capacity, 0);
    const cohortConfirmed = cohorts.reduce(
      (sum, c) => sum + c.confirmedCount,
      0,
    );
    return {
      mentors: mentors?.mentors ?? 0,
      reservedSlots: mentors?.reserved ?? 0,
      totalSlots: mentors?.capacity ?? 0,
      utilizationRate: mentors?.capacity
        ? Math.round((mentors.reserved / mentors.capacity) * 10000) / 10000
        : null,
      cohorts: cohorts.map((c) => ({
        id: String(c._id),
        name: c.name,
        capacity: c.capacity,
        confirmedCount: c.confirmedCount,
        status: c.status,
      })),
      cohortTotals: { capacity: cohortCapacity, confirmed: cohortConfirmed },
    };
  }

  /** Eligible mentees without an active engagement, capped at 500. */
  private async unmatchedMenteeCount(programId?: string): Promise<number> {
    const [mentees, engaged] = await Promise.all([
      this.profileModel
        .find({
          kind: ParticipantRole.MENTEE,
          eligible: true,
          ...(programId ? { programIds: programId } : {}),
        })
        .select('userId')
        .limit(5000)
        .lean(),
      this.engagementModel.distinct('menteeId', {
        status: EngagementStatus.ACTIVE,
        ...(programId ? { programId } : {}),
      }),
    ]);
    const engagedSet = new Set(engaged.map((id) => String(id)));
    return mentees.filter((m) => !engagedSet.has(m.userId)).length;
  }

  async queue(
    queue: CoordinatorQueue,
    query: CoordinatorQueueQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const now = new Date();
    const programScope = this.str(query.programId);

    switch (queue) {
      case CoordinatorQueue.ELIGIBILITY_REVIEW: {
        const filter = {
          ...this.oid(query.programId),
          status: { $in: OPEN_APPLICATION_STATUSES },
        };
        const [rows, total] = await Promise.all([
          this.applicationModel
            .find(filter)
            .sort({ 'review.priorityRank': -1, 'review.dueAt': 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select(
              'programId applicantId status review.priority review.dueAt submittedAt',
            )
            .lean(),
          this.applicationModel.countDocuments(filter),
        ]);
        return this.queuePage(
          queue,
          page,
          limit,
          total,
          query,
          rows.map((row) => ({
            id: String(row._id),
            programId: String(row.programId),
            applicant: counterpartRef(row.applicantId),
            status: row.status,
            priority: row.review?.priority ?? null,
            dueAt: row.review?.dueAt ?? null,
            submittedAt: row.submittedAt,
          })),
        );
      }
      case CoordinatorQueue.EXPIRING_PROPOSALS: {
        const windowHours = DEFAULT_WINDOW_HOURS;
        const horizon = new Date(now.getTime() + windowHours * 3600000);
        const filter = {
          ...programScope,
          status: { $in: [...OPEN_PROPOSAL_STATUSES] },
          expiresAt: { $lte: horizon },
        };
        const [rows, total] = await Promise.all([
          this.proposalModel
            .find(filter)
            .sort({ expiresAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('mentorId menteeId programId expiresAt status')
            .lean(),
          this.proposalModel.countDocuments(filter),
        ]);
        return this.queuePage(
          queue,
          page,
          limit,
          total,
          query,
          rows.map((p) => ({
            id: String(p._id),
            programId: p.programId,
            mentor: counterpartRef(p.mentorId),
            mentee: counterpartRef(p.menteeId),
            expiresAt: p.expiresAt,
          })),
        );
      }
      case CoordinatorQueue.UNMATCHED_PARTICIPANTS: {
        const mentors = await this.profileModel
          .find({
            kind: ParticipantRole.MENTOR,
            eligible: true,
            acceptingMentees: true,
            ...(query.programId ? { programIds: query.programId } : {}),
            $expr: { $lt: ['$reservedSlots', '$maxActiveMentees'] },
          })
          .select('userId reservedSlots maxActiveMentees focusAreas')
          .limit(limit)
          .lean();
        const mentees = await this.unmatchedMentees(query.programId, limit);
        const total =
          (await this.profileModel.countDocuments({
            kind: ParticipantRole.MENTOR,
            eligible: true,
            acceptingMentees: true,
            ...(query.programId ? { programIds: query.programId } : {}),
            $expr: { $lt: ['$reservedSlots', '$maxActiveMentees'] },
          })) + (await this.unmatchedMenteeCount(query.programId));
        return this.queuePage(queue, page, limit, total, query, {
          mentors: mentors.map((m) => ({
            user: counterpartRef(m.userId),
            openSlots: Math.max(m.maxActiveMentees - m.reservedSlots, 0),
            focusAreas: m.focusAreas,
          })),
          mentees,
        });
      }
      case CoordinatorQueue.SCHEDULE_RISKS: {
        const horizon = new Date(now.getTime() + SCHEDULE_RISK_HOURS * 3600000);
        const filter = {
          ...programScope,
          ...(query.cohortId ? { cohortId: query.cohortId } : {}),
          status: OpsSessionStatus.SCHEDULED,
          confirmed: false,
          startsAt: { $gte: now, $lte: horizon },
        };
        const [rows, total] = await Promise.all([
          this.sessionModel
            .find(filter)
            .sort({ startsAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('mentorId menteeId startsAt endsAt topic programId')
            .lean(),
          this.sessionModel.countDocuments(filter),
        ]);
        return this.queuePage(
          queue,
          page,
          limit,
          total,
          query,
          rows.map((s) => ({
            id: String(s._id),
            programId: s.programId,
            mentor: counterpartRef(s.mentorId),
            mentee: counterpartRef(s.menteeId),
            startsAt: s.startsAt,
            topic: s.topic,
          })),
        );
      }
      case CoordinatorQueue.OVERDUE_MILESTONES: {
        const filter = {
          ...programScope,
          $or: [
            { status: MilestoneStatus.OVERDUE },
            { status: MilestoneStatus.PENDING, dueAt: { $lt: now } },
          ],
        };
        const [rows, total] = await Promise.all([
          this.milestoneModel
            .find(filter)
            .sort({ dueAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select(
              'title status dueAt engagementId mentorId menteeId programId',
            )
            .lean(),
          this.milestoneModel.countDocuments(filter),
        ]);
        return this.queuePage(
          queue,
          page,
          limit,
          total,
          query,
          rows.map((m) => ({
            id: String(m._id),
            title: m.title,
            status: m.status,
            dueAt: m.dueAt,
            engagementId: m.engagementId,
            mentor: counterpartRef(m.mentorId),
            mentee: counterpartRef(m.menteeId),
          })),
        );
      }
      case CoordinatorQueue.DISPUTES: {
        const filter = {
          ...programScope,
          status: { $in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW] },
        };
        const [rows, total] = await Promise.all([
          this.disputeModel
            .find(filter)
            .sort({ createdAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('engagementId programId reason status createdAt')
            .lean(),
          this.disputeModel.countDocuments(filter),
        ]);
        return this.queuePage(
          queue,
          page,
          limit,
          total,
          query,
          rows.map((d) => ({
            id: String(d._id),
            engagementId: d.engagementId,
            programId: String(d.programId),
            reason: d.reason,
            status: d.status,
            createdAt: d.createdAt,
          })),
        );
      }
    }
  }

  private async unmatchedMentees(
    programId?: string,
    limit = 50,
  ): Promise<Array<{ user: { userId: string } }>> {
    const [mentees, engaged] = await Promise.all([
      this.profileModel
        .find({
          kind: ParticipantRole.MENTEE,
          eligible: true,
          ...(programId ? { programIds: programId } : {}),
        })
        .select('userId focusAreas')
        .limit(5000)
        .lean(),
      this.engagementModel.distinct('menteeId', {
        status: EngagementStatus.ACTIVE,
        ...(programId ? { programId } : {}),
      }),
    ]);
    const engagedSet = new Set(engaged.map((id) => String(id)));
    return mentees
      .filter((m) => !engagedSet.has(m.userId))
      .slice(0, limit)
      .map((m) => ({ user: counterpartRef(m.userId) }));
  }

  private queuePage(
    queue: CoordinatorQueue,
    page: number,
    limit: number,
    total: number,
    query: CoordinatorQueueQueryDto,
    items: unknown,
  ): Record<string, unknown> {
    return {
      meta: {
        queue,
        page,
        limit,
        total,
        scope: {
          programId: query.programId ?? null,
          cohortId: query.cohortId ?? null,
        },
      },
      items,
      link: QUEUE_LINKS[queue],
    };
  }

  async savedFilters(actor: MentorshipActor): Promise<Record<string, unknown>> {
    const saved = await this.filterModel
      .findOne({ userId: actor.userId, scope: DashboardScope.COORDINATOR })
      .lean();
    return {
      filters: saved
        ? {
            programId: saved.programId ?? null,
            cohortId: saved.cohortId ?? null,
            windowHours: saved.windowHours ?? DEFAULT_WINDOW_HOURS,
            includeResolvedDisputes: Boolean(saved.includeResolvedDisputes),
            updatedAt: saved.updatedAt ?? null,
          }
        : {
            programId: null,
            cohortId: null,
            windowHours: DEFAULT_WINDOW_HOURS,
            includeResolvedDisputes: false,
            updatedAt: null,
          },
    };
  }

  async saveFilters(
    actor: MentorshipActor,
    dto: SaveDashboardFiltersDto,
  ): Promise<Record<string, unknown>> {
    const updated = await this.filterModel
      .findOneAndUpdate(
        { userId: actor.userId, scope: DashboardScope.COORDINATOR },
        {
          $set: {
            programId: dto.programId ?? null,
            cohortId: dto.cohortId ?? null,
            windowHours: dto.windowHours ?? DEFAULT_WINDOW_HOURS,
            includeResolvedDisputes: dto.includeResolvedDisputes ?? false,
          },
        },
        { upsert: true, new: true },
      )
      .lean();
    return {
      filters: {
        programId: updated.programId ?? null,
        cohortId: updated.cohortId ?? null,
        windowHours: updated.windowHours,
        includeResolvedDisputes: Boolean(updated.includeResolvedDisputes),
        updatedAt: updated.updatedAt ?? null,
      },
    };
  }
}
