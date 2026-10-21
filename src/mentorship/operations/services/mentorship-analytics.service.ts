import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ValidationDomainException } from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import {
  OPEN_APPLICATION_STATUSES,
  ApplicationRead,
} from '../schemas/application-read.schema';
import { EligibilityEvaluationRead } from '../schemas/eligibility-evaluation-read.schema';
import { EngagementStatus, ProposalStatus } from '../../mentorship.constants';
import {
  Cohort,
  CohortEnrollment,
} from '../../programs/schemas/program.schema';
import { MatchProposal } from '../../schemas/match-proposal.schema';
import { MentorshipEngagement } from '../../schemas/mentorship-engagement.schema';
import { MentorshipProfile } from '../../schemas/mentorship-profile.schema';
import {
  AnalyticsExportQueryDto,
  AnalyticsQueryDto,
} from '../dto/mentorship-operations-query.dto';
import {
  AlertSeverity,
  JobRunStatus,
  OpsJob,
} from '../enums/mentorship-operations.enums';
import { MentorshipAlert } from '../schemas/mentorship-alert.schema';
import { MentorshipOpsDispute } from '../schemas/mentorship-ops-dispute.schema';
import { MentorshipOpsMilestone } from '../schemas/mentorship-ops-milestone.schema';
import { MentorshipOpsJobRun } from '../schemas/mentorship-ops-job-run.schema';
import { MentorshipSession } from '../schemas/mentorship-session.schema';
import { METRIC_DEFINITIONS, median, ratio } from '../shared/metric-catalog';
import {
  maskForExport,
  resolveSuppressionThreshold,
  suppressCount,
} from '../shared/mentorship-ops-privacy';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_EXPORT_ROWS = 5000;
const DEFAULT_FRESHNESS_MINUTES = 30;

const CLOSED_PROPOSAL_STATUSES: ProposalStatus[] = [
  ProposalStatus.ACCEPTED,
  ProposalStatus.REJECTED,
  ProposalStatus.EXPIRED,
  ProposalStatus.WITHDRAWN,
  ProposalStatus.SUPERSEDED,
];

const DECIDED_APPLICATION_STATUSES = ['decided'];

interface AnalyticsWindow {
  from: Date;
  to: Date;
}

/**
 * Mentorship program analytics (MENTOR-114).
 *
 * Every number is window-scoped ([from, to), default last 30 days) and
 * program/cohort scoped. Percentages always carry their denominator in the
 * payload so totals reconcile. Segment breakouts (per-cohort rows) apply
 * small-group suppression; exports are explicitly program-scoped and never
 * leave a cell that could identify a group below the threshold.
 */
@Injectable()
export class MentorshipAnalyticsService {
  constructor(
    @InjectModel(ApplicationRead.name)
    private readonly applicationModel: Model<ApplicationRead>,
    @InjectModel(EligibilityEvaluationRead.name)
    private readonly eligibilityModel: Model<EligibilityEvaluationRead>,
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposal>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagement>,
    @InjectModel(Cohort.name)
    private readonly cohortModel: Model<Cohort>,
    @InjectModel(CohortEnrollment.name)
    private readonly enrollmentModel: Model<CohortEnrollment>,
    @InjectModel(MentorshipSession.name)
    private readonly sessionModel: Model<MentorshipSession>,
    @InjectModel(MentorshipOpsMilestone.name)
    private readonly milestoneModel: Model<MentorshipOpsMilestone>,
    @InjectModel(MentorshipOpsDispute.name)
    private readonly disputeModel: Model<MentorshipOpsDispute>,
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfile>,
    @InjectModel(MentorshipAlert.name)
    private readonly alertModel: Model<MentorshipAlert>,
    @InjectModel(MentorshipOpsJobRun.name)
    private readonly jobRunModel: Model<MentorshipOpsJobRun>,
  ) {}

  resolveWindow(query: AnalyticsQueryDto): AnalyticsWindow {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ValidationDomainException(
        'from/to must be valid ISO 8601 timestamps',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    if (from >= to) {
      throw new ValidationDomainException(
        'from must be earlier than to',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    return { from, to };
  }

  private meta(
    query: AnalyticsQueryDto,
    window: AnalyticsWindow,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      scope: {
        programId: query.programId ?? null,
        cohortId: query.cohortId ?? null,
      },
      suppressionThreshold: resolveSuppressionThreshold(),
      freshness: null,
      ...extra,
    };
  }

  /** Latest background run per ops job + stale flag for job-derived metrics. */
  async freshness(): Promise<Array<Record<string, unknown>>> {
    const latest = await this.jobRunModel
      .aggregate([
        { $sort: { startedAt: -1 } },
        { $group: { _id: '$job', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ])
      .exec();
    const staleAfterMs =
      Number(
        process.env.MENTORSHIP_OPS_FRESHNESS_MINUTES ||
          DEFAULT_FRESHNESS_MINUTES,
      ) *
      60 *
      1000;
    const now = Date.now();
    return latest.map((run) => {
      const finishedAt = run.finishedAt
        ? new Date(run.finishedAt).getTime()
        : null;
      return {
        job: run.job,
        lastStartedAt: run.startedAt,
        lastFinishedAt: run.finishedAt,
        status: run.status,
        summary: run.summary ?? {},
        stale: finishedAt === null || now - finishedAt > staleAfterMs,
      };
    });
  }

  private stringScope(query: AnalyticsQueryDto): Record<string, unknown> {
    return query.programId ? { programId: query.programId } : {};
  }

  private oidScope(query: AnalyticsQueryDto): Record<string, unknown> {
    return query.programId
      ? { programId: new Types.ObjectId(query.programId) }
      : {};
  }

  /** Cohort scoping for participant-level records via confirmed enrollments. */
  private async cohortParticipantIds(
    query: AnalyticsQueryDto,
  ): Promise<string[] | null> {
    if (!query.cohortId) return null;
    const rows = await this.enrollmentModel
      .distinct('participantId', {
        cohortId: query.cohortId,
        status: 'confirmed',
      })
      .exec();
    return rows.map((id) => String(id));
  }

  async overview(query: AnalyticsQueryDto): Promise<Record<string, unknown>> {
    const window = this.resolveWindow(query);
    const freshness = await this.freshness();
    return {
      meta: this.meta(query, window, {
        freshness,
        metricDefinitions: METRIC_DEFINITIONS,
      }),
      scope: {
        programId: query.programId ?? null,
        cohortId: query.cohortId ?? null,
      },
    };
  }

  async funnel(query: AnalyticsQueryDto): Promise<Record<string, unknown>> {
    const window = this.resolveWindow(query);
    const participantIds = await this.cohortParticipantIds(query);
    const scoped =
      participantIds === null
        ? {}
        : participantIds.length === 0
          ? { __impossible: true }
          : { applicantId: { $in: participantIds } };
    const baseMatch = {
      ...this.oidScope(query),
      submittedAt: { $gte: window.from, $lt: window.to },
      ...scoped,
    };

    const [
      submittedByStatus,
      decisions,
      timeToDecision,
      queueDepth,
      overdueReviews,
    ] = await Promise.all([
      // groupBy stays dynamic so the legacy vocab variant of the same
      // collection still reconciles instead of silently disappearing.
      this.applicationModel
        .aggregate([
          { $match: baseMatch },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.applicationModel
        .aggregate([
          {
            $match: {
              ...this.oidScope(query),
              'review.decision.decidedAt': {
                $gte: window.from,
                $lt: window.to,
              },
              ...scoped,
            },
          },
          { $group: { _id: '$review.decision.outcome', count: { $sum: 1 } } },
        ])
        .exec(),
      this.applicationModel
        .aggregate([
          {
            $match: {
              ...this.oidScope(query),
              'review.decision.decidedAt': {
                $gte: window.from,
                $lt: window.to,
              },
              ...scoped,
            },
          },
          {
            $project: {
              hours: {
                $divide: [
                  { $subtract: ['$review.decision.decidedAt', '$submittedAt'] },
                  3600000,
                ],
              },
            },
          },
          { $limit: MAX_EXPORT_ROWS },
          { $group: { _id: null, hours: { $push: '$hours' } } },
        ])
        .exec(),
      this.applicationModel.countDocuments({
        ...this.oidScope(query),
        status: { $in: OPEN_APPLICATION_STATUSES },
        ...(participantIds !== null
          ? participantIds.length === 0
            ? { __impossible: true }
            : { applicantId: { $in: participantIds } }
          : {}),
      }),
      this.applicationModel.countDocuments({
        ...this.oidScope(query),
        status: { $in: OPEN_APPLICATION_STATUSES },
        'review.dueAt': { $lt: new Date() },
        ...(participantIds !== null
          ? participantIds.length === 0
            ? { __impossible: true }
            : { applicantId: { $in: participantIds } }
          : {}),
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    let applicationsReceived = 0;
    for (const row of submittedByStatus as Array<{
      _id: string | null;
      count: number;
    }>) {
      const key = row._id ?? 'unknown';
      statusCounts[key] = row.count;
      applicationsReceived += row.count;
    }

    const outcomeCounts: Record<string, number> = {};
    let decidedApplications = 0;
    for (const row of decisions as Array<{
      _id: string | null;
      count: number;
    }>) {
      const key = row._id ?? 'unknown';
      outcomeCounts[key] = row.count;
      decidedApplications += row.count;
    }
    const accepted = outcomeCounts.accepted ?? 0;
    const rejected = outcomeCounts.rejected ?? 0;

    const hours =
      timeToDecision.length > 0
        ? ((timeToDecision[0] as { hours: number[] }).hours ?? []).map(Number)
        : [];

    const eligibility = await this.eligibilityModel
      .aggregate([
        {
          $match: {
            ...this.oidScope(query),
            kind: 'submission',
            lastEvaluatedAt: { $gte: window.from, $lt: window.to },
            ...(participantIds !== null
              ? participantIds.length === 0
                ? { __impossible: true }
                : { applicantId: { $in: participantIds } }
              : {}),
          },
        },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ])
      .exec();
    const eligibilityCounts: Record<string, number> = {};
    let eligibilityEvaluations = 0;
    for (const row of eligibility as Array<{ _id: string; count: number }>) {
      eligibilityCounts[row._id] = row.count;
      eligibilityEvaluations += row.count;
    }

    const submittedByStatusTotal = Object.values(statusCounts).reduce(
      (a, b) => a + b,
      0,
    );
    return {
      meta: this.meta(query, window, {
        freshness: await this.freshness(),
        metricDefinitions: {
          applicationsReceived: METRIC_DEFINITIONS.applicationsReceived,
          reviewQueueDepth: METRIC_DEFINITIONS.reviewQueueDepth,
          overdueReviews: METRIC_DEFINITIONS.overdueReviews,
          acceptanceRate: METRIC_DEFINITIONS.acceptanceRate,
          rejectionRate: METRIC_DEFINITIONS.rejectionRate,
          timeToDecisionHours: METRIC_DEFINITIONS.timeToDecisionHours,
          eligibilityPassRate: METRIC_DEFINITIONS.eligibilityPassRate,
        },
      }),
      applications: {
        received: applicationsReceived,
        byStatus: statusCounts,
        // component sum must equal received for totals to reconcile
        reconciles: submittedByStatusTotal === applicationsReceived,
      },
      reviewQueue: {
        depth: queueDepth,
        overdue: overdueReviews,
      },
      decisions: {
        decided: decidedApplications,
        byOutcome: outcomeCounts,
        acceptanceRate: ratio(accepted, decidedApplications),
        rejectionRate: ratio(rejected, decidedApplications),
        meanHoursToDecision: hours.length
          ? Math.round(
              (hours.reduce((a, b) => a + b, 0) / hours.length) * 100,
            ) / 100
          : null,
        medianHoursToDecision: median(hours),
        denominators: { decidedApplications },
      },
      eligibility: {
        evaluations: eligibilityEvaluations,
        byOutcome: eligibilityCounts,
        passRate: ratio(eligibilityCounts.pass ?? 0, eligibilityEvaluations),
        denominators: { eligibilityEvaluations },
      },
    };
  }

  async engagement(query: AnalyticsQueryDto): Promise<Record<string, unknown>> {
    const window = this.resolveWindow(query);
    const scope = this.stringScope(query);

    const [
      createdByStatus,
      activatedInRange,
      acceptedInRange,
      retentionRows,
      tenureRows,
    ] = await Promise.all([
      this.proposalModel
        .aggregate([
          {
            $match: {
              ...scope,
              createdAt: { $gte: window.from, $lt: window.to },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.engagementModel
        .find({
          ...scope,
          activatedAt: { $gte: window.from, $lt: window.to },
        })
        .select('proposalId activatedAt updatedAt status')
        .lean(),
      this.proposalModel.countDocuments({
        ...scope,
        createdAt: { $gte: window.from, $lt: window.to },
        status: { $in: [ProposalStatus.ACCEPTED, ProposalStatus.ACTIVATING] },
      }),
      this.engagementModel
        .aggregate([
          {
            $match: {
              ...scope,
              activatedAt: { $lt: window.to },
            },
          },
          {
            $project: {
              stillActive: {
                $or: [
                  { $eq: ['$status', EngagementStatus.ACTIVE] },
                  {
                    $and: [
                      { $eq: ['$status', EngagementStatus.ENDED] },
                      { $gt: ['$updatedAt', window.to] },
                    ],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: ['$stillActive', 1, 0] } },
            },
          },
        ])
        .exec(),
      this.engagementModel
        .find({
          ...scope,
          status: EngagementStatus.ENDED,
          updatedAt: { $gte: window.from, $lt: window.to },
        })
        .select('activatedAt updatedAt')
        .limit(MAX_EXPORT_ROWS)
        .lean(),
    ]);

    const proposalsByStatus: Record<string, number> = {};
    let proposalsCreated = 0;
    for (const row of createdByStatus as Array<{
      _id: string;
      count: number;
    }>) {
      proposalsByStatus[row._id] = row.count;
      proposalsCreated += row.count;
    }
    const closedProposals = CLOSED_PROPOSAL_STATUSES.reduce(
      (sum, status) => sum + (proposalsByStatus[status] ?? 0),
      0,
    );

    const proposalIds = activatedInRange.map((e) => e.proposalId);
    const proposals = proposalIds.length
      ? await this.proposalModel
          .find({ _id: { $in: proposalIds } })
          .select('createdAt')
          .lean()
          .then(
            (rows) => new Map(rows.map((r) => [String(r._id), r.createdAt])),
          )
      : new Map<string, Date>();
    const hoursToMatch = activatedInRange
      .map((e) => {
        const createdAt = proposals.get(String(e.proposalId));
        if (!createdAt) return null;
        return (
          (new Date(e.activatedAt).getTime() - new Date(createdAt).getTime()) /
          3600000
        );
      })
      .filter((v): v is number => v !== null && v >= 0);

    const tenureDays = tenureRows
      .map(
        (e) =>
          (new Date(e.updatedAt ?? e.activatedAt).getTime() -
            new Date(e.activatedAt).getTime()) /
          86400000,
      )
      .filter((v) => v >= 0);

    const retention = retentionRows[0] as
      | { total: number; active: number }
      | undefined;

    return {
      meta: this.meta(query, window, {
        freshness: await this.freshness(),
        metricDefinitions: {
          proposalsCreated: METRIC_DEFINITIONS.proposalsCreated,
          proposalAcceptanceRate: METRIC_DEFINITIONS.proposalAcceptanceRate,
          activationRate: METRIC_DEFINITIONS.activationRate,
          medianHoursToMatch: METRIC_DEFINITIONS.medianHoursToMatch,
          retentionActiveRate: METRIC_DEFINITIONS.retentionActiveRate,
          medianMenteeTenureDays: METRIC_DEFINITIONS.medianMenteeTenureDays,
        },
      }),
      proposals: {
        created: proposalsCreated,
        byStatus: proposalsByStatus,
        closed: closedProposals,
        acceptanceRate: ratio(
          (proposalsByStatus[ProposalStatus.ACCEPTED] ?? 0) +
            (proposalsByStatus[ProposalStatus.ACTIVATING] ?? 0),
          closedProposals,
        ),
        denominators: { closedProposals },
      },
      activation: {
        activated: activatedInRange.length,
        acceptedProposals: acceptedInRange,
        activationRate: ratio(activatedInRange.length, acceptedInRange),
        medianHoursToMatch: median(hoursToMatch),
        denominators: { acceptedProposals: acceptedInRange },
      },
      retention: {
        activeAtWindowEnd: retention?.active ?? 0,
        retentionActiveRate: ratio(
          retention?.active ?? 0,
          retention?.total ?? 0,
        ),
        denominators: {
          engagementsActivatedBeforeWindow: retention?.total ?? 0,
        },
        medianMenteeTenureDays: median(tenureDays),
      },
    };
  }

  async sessions(query: AnalyticsQueryDto): Promise<Record<string, unknown>> {
    const window = this.resolveWindow(query);
    const scope = this.stringScope(query);
    const match = {
      ...scope,
      ...(query.cohortId ? { cohortId: query.cohortId } : {}),
      startsAt: { $gte: window.from, $lt: window.to },
    };

    const [byStatus, attendance, firstSessionRows] = await Promise.all([
      this.sessionModel
        .aggregate([
          { $match: match },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.sessionModel
        .aggregate([
          { $match: { ...match, status: 'completed' } },
          { $group: { _id: '$attendance', count: { $sum: 1 } } },
        ])
        .exec(),
      this.engagementModel
        .aggregate([
          { $match: { ...scope, activatedAt: { $lt: window.to } } },
          { $project: { activatedAt: 1 } },
        ])
        .exec(),
    ]);

    const statusCounts: Record<string, number> = {};
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;
    for (const row of byStatus as Array<{ _id: string; count: number }>) {
      statusCounts[row._id] = row.count;
      if (row._id === 'completed') completed = row.count;
      if (row._id === 'cancelled') cancelled = row.count;
      if (row._id === 'no_show') noShow = row.count;
    }
    const attendanceCounts: Record<string, number> = {};
    for (const row of (await attendance) as Array<{
      _id: string | null;
      count: number;
    }>) {
      attendanceCounts[row._id ?? 'unrecorded'] = row.count;
    }
    const present = attendanceCounts.present ?? 0;

    const engagementActivations = new Map(
      (
        firstSessionRows as Array<{ _id: Types.ObjectId; activatedAt: Date }>
      ).map((r) => [String(r._id), new Date(r.activatedAt)]),
    );
    let hoursToFirst: number[] = [];
    if (engagementActivations.size > 0) {
      const firstSessions = await this.sessionModel.aggregate([
        {
          $match: {
            ...scope,
            ...(query.cohortId ? { cohortId: query.cohortId } : {}),
          },
        },
        { $sort: { startsAt: 1 } },
        {
          $group: { _id: '$engagementId', firstStart: { $first: '$startsAt' } },
        },
        { $limit: MAX_EXPORT_ROWS },
      ]);
      hoursToFirst = firstSessions
        .map((row: { _id: string; firstStart: Date }) => {
          const activatedAt = engagementActivations.get(String(row._id));
          if (!activatedAt) return null;
          return (
            (new Date(row.firstStart).getTime() - activatedAt.getTime()) /
            3600000
          );
        })
        .filter((v: number | null): v is number => v !== null && v >= 0);
    }

    const completedPlusCancelled = completed + cancelled;
    const completedPlusNoShow = completed + noShow;

    return {
      meta: this.meta(query, window, {
        freshness: await this.freshness(),
        metricDefinitions: {
          sessionsCompleted: METRIC_DEFINITIONS.sessionsCompleted,
          sessionCompletionRate: METRIC_DEFINITIONS.sessionCompletionRate,
          attendanceRate: METRIC_DEFINITIONS.attendanceRate,
          noShowRate: METRIC_DEFINITIONS.noShowRate,
          medianHoursToFirstSession:
            METRIC_DEFINITIONS.medianHoursToFirstSession,
        },
      }),
      byStatus: statusCounts,
      completed,
      completionRate: ratio(completed, completedPlusCancelled),
      attendance: {
        byAttendance: attendanceCounts,
        attendanceRate: ratio(present, completed),
      },
      noShowRate: ratio(noShow, completedPlusNoShow),
      medianHoursToFirstSession: median(hoursToFirst),
      denominators: {
        completedPlusCancelled,
        completedPlusNoShow,
        sessionsCompleted: completed,
      },
    };
  }

  async outcomes(query: AnalyticsQueryDto): Promise<Record<string, unknown>> {
    const window = this.resolveWindow(query);
    const scope = this.stringScope(query);

    const [
      milestoneStats,
      disputeByStatus,
      activeEngagements,
      capacity,
      mentorAlerts,
    ] = await Promise.all([
      this.milestoneModel
        .aggregate([
          {
            $match: { ...scope, dueAt: { $gte: window.from, $lt: window.to } },
          },
          {
            $group: {
              _id: null,
              due: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
              },
              overdueNow: {
                $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] },
              },
            },
          },
        ])
        .exec(),
      this.disputeModel
        .aggregate([
          {
            $match: {
              ...scope,
              createdAt: { $gte: window.from, $lt: window.to },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.engagementModel.countDocuments({
        ...scope,
        activatedAt: { $lt: window.to },
        $or: [
          { status: EngagementStatus.ACTIVE },
          { status: EngagementStatus.ENDED, updatedAt: { $gt: window.from } },
        ],
      }),
      this.profileModel.aggregate([
        {
          $match: {
            kind: 'mentor',
            ...(query.programId ? { programIds: query.programId } : {}),
          },
        },
        {
          $group: {
            _id: null,
            reserved: { $sum: '$reservedSlots' },
            capacity: { $sum: '$maxActiveMentees' },
            mentors: { $sum: 1 },
          },
        },
      ]),
      this.alertModel.countDocuments({
        severity: { $in: [AlertSeverity.WARNING, AlertSeverity.CRITICAL] },
        ...(query.programId ? { programId: query.programId } : {}),
      }),
    ]);

    const stats = milestoneStats[0] as
      | { due: number; completed: number; overdueNow: number }
      | undefined;
    const due = stats?.due ?? 0;
    const completedMilestones = stats?.completed ?? 0;

    const disputeCounts: Record<string, number> = {};
    let disputesRaised = 0;
    for (const row of disputeByStatus as Array<{
      _id: string;
      count: number;
    }>) {
      disputeCounts[row._id] = row.count;
      disputesRaised += row.count;
    }

    const cap = capacity[0] as
      | { reserved: number; capacity: number; mentors: number }
      | undefined;

    const cohortBreakdown = await this.cohortBreakdown(query, window);
    const threshold = resolveSuppressionThreshold();

    return {
      meta: this.meta(query, window, {
        freshness: await this.freshness(),
        metricDefinitions: {
          milestoneCompletionRate: METRIC_DEFINITIONS.milestoneCompletionRate,
          disputeRate: METRIC_DEFINITIONS.disputeRate,
          mentorCapacityUtilization:
            METRIC_DEFINITIONS.mentorCapacityUtilization,
        },
      }),
      milestones: {
        due,
        completed: completedMilestones,
        overdueNow: stats?.overdueNow ?? 0,
        completionRate: ratio(completedMilestones, due),
        denominators: { milestonesDue: due },
      },
      disputes: {
        raised: disputesRaised,
        byStatus: disputeCounts,
        disputeRate: ratio(disputesRaised, activeEngagements),
        denominators: { engagementsActiveInWindow: activeEngagements },
      },
      capacity: {
        mentors: cap?.mentors ?? 0,
        reservedSlots: cap?.reserved ?? 0,
        totalSlots: cap?.capacity ?? 0,
        utilizationRate: ratio(cap?.reserved ?? 0, cap?.capacity ?? 0),
        denominators: { mentorCapacitySlots: cap?.capacity ?? 0 },
      },
      openAlerts: mentorAlerts,
      cohortBreakdown: cohortBreakdown.map((row) => ({
        ...row,
        sessions: suppressCount(row.sessions, threshold),
        applications: suppressCount(row.applications, threshold),
      })),
    };
  }

  /** Per-cohort rows; used by outcomes + export (suppression applied by callers). */
  private async cohortBreakdown(
    query: AnalyticsQueryDto,
    window: AnalyticsWindow,
  ): Promise<
    Array<{
      cohortId: string;
      name: string;
      sessions: number;
      applications: number;
    }>
  > {
    const cohortMatch = query.programId ? { programId: query.programId } : {};
    const cohorts = query.cohortId
      ? await this.cohortModel
          .find({ _id: new Types.ObjectId(query.cohortId) })
          .lean()
      : await this.cohortModel.find(cohortMatch).limit(200).lean();
    if (cohorts.length === 0) return [];

    const cohortIds = cohorts.map((c) => String(c._id));
    const [sessionRows, applicationRows] = await Promise.all([
      this.sessionModel.aggregate([
        {
          $match: {
            cohortId: { $in: cohortIds },
            startsAt: { $gte: window.from, $lt: window.to },
          },
        },
        { $group: { _id: '$cohortId', count: { $sum: 1 } } },
      ]),
      this.applicationModel.aggregate([
        {
          $match: {
            ...this.oidScope(query),
            submittedAt: { $gte: window.from, $lt: window.to },
          },
        },
        { $group: { _id: '$programId', count: { $sum: 1 } } },
      ]),
    ]);

    const sessionsByCohort = new Map(
      (sessionRows as Array<{ _id: string; count: number }>).map((r) => [
        String(r._id),
        r.count,
      ]),
    );
    const totalApplications = (
      applicationRows as Array<{ count: number }>
    ).reduce((sum, r) => sum + r.count, 0);
    return cohorts.map((cohort) => ({
      cohortId: String(cohort._id),
      name: cohort.name,
      sessions: sessionsByCohort.get(String(cohort._id)) ?? 0,
      // applications are program-level; cohorts only segment sessions.
      applications: totalApplications,
    }));
  }

  async exportData(
    query: AnalyticsExportQueryDto,
  ): Promise<{ contentType: string; filename: string; body: string }> {
    const window = this.resolveWindow(query);
    const threshold = resolveSuppressionThreshold();
    const [funnelData, engagementData, sessionData, outcomeData] =
      await Promise.all([
        this.funnel(query),
        this.engagement(query),
        this.sessions(query),
        this.outcomes(query),
      ]);

    const rows: Array<Record<string, unknown>> = [];
    const push = (
      section: string,
      metric: string,
      value: unknown,
      denominator: unknown = null,
    ) =>
      rows.push({
        section,
        metric,
        value:
          typeof value === 'number' ? maskForExport(value, threshold) : value,
        denominator,
      });

    const funnel = funnelData as Record<string, Record<string, unknown>>;
    push('window', 'from', window.from.toISOString());
    push('window', 'to', window.to.toISOString());
    push(
      'applications',
      'received',
      (funnel.applications as { received: number }).received,
    );
    const queue = funnel.reviewQueue as { depth: number; overdue: number };
    push('applications', 'reviewQueueDepth', queue.depth);
    push('applications', 'overdueReviews', queue.overdue);
    const decisions = funnel.decisions as Record<string, unknown>;
    push('decisions', 'decided', decisions.decided, decisions.denominators);
    push(
      'decisions',
      'acceptanceRate',
      decisions.acceptanceRate,
      decisions.denominators,
    );
    push(
      'decisions',
      'rejectionRate',
      decisions.rejectionRate,
      decisions.denominators,
    );
    push('decisions', 'medianHoursToDecision', decisions.medianHoursToDecision);
    const eligibility = funnel.eligibility as Record<string, unknown>;
    push('eligibility', 'evaluations', eligibility.evaluations);
    push(
      'eligibility',
      'passRate',
      eligibility.passRate,
      eligibility.denominators,
    );

    const engagement = engagementData as Record<
      string,
      Record<string, unknown>
    >;
    push(
      'proposals',
      'created',
      (engagement.proposals as { created: number }).created,
    );
    push(
      'proposals',
      'acceptanceRate',
      (engagement.proposals as Record<string, unknown>).acceptanceRate,
    );
    const activation = engagement.activation as Record<string, unknown>;
    push(
      'activation',
      'activated',
      activation.activated,
      activation.denominators,
    );
    push(
      'activation',
      'activationRate',
      activation.activationRate,
      activation.denominators,
    );
    push('activation', 'medianHoursToMatch', activation.medianHoursToMatch);
    const retention = engagement.retention as Record<string, unknown>;
    push(
      'retention',
      'activeAtWindowEnd',
      retention.activeAtWindowEnd,
      retention.denominators,
    );
    push('retention', 'retentionActiveRate', retention.retentionActiveRate);
    push(
      'retention',
      'medianMenteeTenureDays',
      retention.medianMenteeTenureDays,
    );

    const sessions = sessionData as Record<string, unknown>;
    push('sessions', 'completed', sessions.completed, sessions.denominators);
    push('sessions', 'completionRate', sessions.completionRate);
    push(
      'sessions',
      'attendanceRate',
      (sessions.attendance as Record<string, unknown>).attendanceRate,
    );
    push('sessions', 'noShowRate', sessions.noShowRate);
    push(
      'sessions',
      'medianHoursToFirstSession',
      sessions.medianHoursToFirstSession,
    );

    const outcomes = outcomeData as Record<string, Record<string, unknown>>;
    const milestones = outcomes.milestones as Record<string, unknown>;
    push('milestones', 'due', milestones.due, milestones.denominators);
    push('milestones', 'completionRate', milestones.completionRate);
    const disputes = outcomes.disputes as Record<string, unknown>;
    push('disputes', 'raised', disputes.raised, disputes.denominators);
    const capacity = outcomes.capacity as Record<string, unknown>;
    push(
      'capacity',
      'utilizationRate',
      capacity.utilizationRate,
      capacity.denominators,
    );

    for (const row of (outcomes.cohortBreakdown ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      const sessionsSup = row.sessions as {
        value: number | null;
        suppressed: boolean;
      };
      const appsSup = row.applications as {
        value: number | null;
        suppressed: boolean;
      };
      rows.push({
        section: 'cohort',
        metric: `${row.cohortId}:${row.name}:sessions`,
        value: sessionsSup.value,
        denominator: sessionsSup.suppressed ? `<${threshold}` : null,
      });
      rows.push({
        section: 'cohort',
        metric: `${row.cohortId}:${row.name}:applications`,
        value: appsSup.value,
        denominator: appsSup.suppressed ? `<${threshold}` : null,
      });
    }

    if (query.format === 'csv') {
      const header = 'section,metric,value,denominator';
      const lines = rows.map((r) =>
        [
          r.section,
          r.metric,
          r.value ?? '',
          typeof r.denominator === 'string'
            ? r.denominator
            : r.denominator
              ? JSON.stringify(r.denominator)
              : '',
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      );
      return {
        contentType: 'text/csv; charset=utf-8',
        filename: `mentorship-analytics-${query.programId}-${window.from.toISOString().slice(0, 10)}-to-${window.to.toISOString().slice(0, 10)}.csv`,
        body: [header, ...lines].join('\n'),
      };
    }
    return {
      contentType: 'application/json; charset=utf-8',
      filename: `mentorship-analytics-${query.programId}.json`,
      body: JSON.stringify({
        meta: this.meta(query, window, { suppressionThreshold: threshold }),
        metricDefinitions: METRIC_DEFINITIONS,
        rows,
      }),
    };
  }
}
