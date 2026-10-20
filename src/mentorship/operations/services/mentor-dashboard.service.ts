import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import { ResourceNotFoundException } from '../../../common/errors/domain.exception';
import { Role } from '../../../common/enums/role.enum';
import {
  OPEN_APPLICATION_STATUSES,
  ApplicationRead,
} from '../schemas/application-read.schema';
import {
  InitiatorKind,
  OPEN_PROPOSAL_STATUSES,
  EngagementStatus,
  ParticipantRole,
} from '../../mentorship.constants';
import { MatchProposal } from '../../schemas/match-proposal.schema';
import { MentorshipEngagement } from '../../schemas/mentorship-engagement.schema';
import { MentorshipProfile } from '../../schemas/mentorship-profile.schema';
import type { MentorshipActor } from '../../mentorship.policy';
import {
  AlertQueryDto,
  MentorDashboardQueryDto,
  MentorEarningsQueryDto,
  MentorSessionsQueryDto,
} from '../dto/mentorship-operations-query.dto';
import { ReadAlertsDto } from '../dto/read-alerts.dto';
import {
  AlertSeverity,
  MilestoneStatus,
  OpsSessionStatus,
  OpsTaskStatus,
  PayoutStatus,
  TaskPriority,
} from '../enums/mentorship-operations.enums';
import { MentorshipAlert } from '../schemas/mentorship-alert.schema';
import { MentorshipOpsMilestone } from '../schemas/mentorship-ops-milestone.schema';
import { MentorshipSession } from '../schemas/mentorship-session.schema';
import { MentorshipTask } from '../schemas/mentorship-task.schema';
import { counterpartRef } from '../shared/mentorship-ops-privacy';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  [TaskPriority.URGENT]: 3,
  [TaskPriority.HIGH]: 2,
  [TaskPriority.NORMAL]: 1,
  [TaskPriority.LOW]: 0,
};

const EARNINGS_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mentor operations dashboard (MENTOR-115 / issue #1432).
 *
 * Role-scoped by construction: every query filters on the resolved mentor
 * id, which is the caller unless an administrator explicitly inspects
 * another mentor. Counterparts are projected as opaque ids only – no names,
 * emails, phones or application answers ever leave these endpoints.
 */
@Injectable()
export class MentorDashboardService {
  constructor(
    @InjectModel(MentorshipSession.name)
    private readonly sessionModel: Model<MentorshipSession>,
    @InjectModel(MentorshipTask.name)
    private readonly taskModel: Model<MentorshipTask>,
    @InjectModel(MentorshipOpsMilestone.name)
    private readonly milestoneModel: Model<MentorshipOpsMilestone>,
    @InjectModel(MentorshipAlert.name)
    private readonly alertModel: Model<MentorshipAlert>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagement>,
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfile>,
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposal>,
    @InjectModel(ApplicationRead.name)
    private readonly applicationModel: Model<ApplicationRead>,
  ) {}

  /**
   * Resolves the mentor this request is scoped to. Tutors are always scoped
   * to themselves; administrators may pass `mentorId` to inspect another.
   */
  resolveMentorId(actor: MentorshipActor, requested?: string): string {
    if (!requested || requested === actor.userId) return actor.userId;
    if (actor.platformRole === Role.ADMIN) return requested;
    throw new ForbiddenException({
      message: 'Mentors can only view their own dashboard',
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });
  }

  async dashboard(
    actor: MentorshipActor,
    query: MentorDashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor, query.mentorId);
    const now = new Date();
    const horizon = new Date(now.getTime() + (query.days ?? 14) * DAY_MS);

    const [
      profile,
      upcomingSessions,
      openProposals,
      activeMentees,
      openTasks,
      milestoneRows,
      unreadAlerts,
      unreadCritical,
      unconfirmedSessions,
      myApplications,
      earnings,
    ] = await Promise.all([
      this.profileModel
        .findOne({ userId: mentorId, kind: ParticipantRole.MENTOR })
        .lean(),
      this.sessionModel
        .find({
          mentorId,
          status: OpsSessionStatus.SCHEDULED,
          startsAt: { $gte: now, $lte: horizon },
        })
        .sort({ startsAt: 1 })
        .limit(10)
        .lean(),
      this.proposalModel
        .find({ mentorId, status: { $in: [...OPEN_PROPOSAL_STATUSES] } })
        .sort({ expiresAt: 1 })
        .limit(20)
        .lean(),
      this.engagementModel
        .find({ mentorId, status: EngagementStatus.ACTIVE })
        .select('menteeId activatedAt programId')
        .limit(50)
        .lean(),
      this.taskModel
        .find({
          assigneeId: mentorId,
          status: { $in: [OpsTaskStatus.OPEN, OpsTaskStatus.IN_PROGRESS] },
        })
        .lean(),
      this.milestoneModel
        .find({
          mentorId,
          status: { $in: [MilestoneStatus.PENDING, MilestoneStatus.OVERDUE] },
        })
        .sort({ dueAt: 1 })
        .limit(20)
        .lean(),
      this.alertModel
        .find({ userId: mentorId, readAt: null })
        .sort({ severity: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      this.alertModel.countDocuments({
        userId: mentorId,
        readAt: null,
        severity: AlertSeverity.CRITICAL,
      }),
      this.sessionModel
        .find({
          mentorId,
          status: OpsSessionStatus.SCHEDULED,
          confirmed: false,
          startsAt: { $gte: now, $lte: new Date(now.getTime() + 7 * DAY_MS) },
        })
        .select('startsAt confirmed')
        .lean(),
      this.applicationModel
        .find({
          applicantId: mentorId,
          status: { $in: OPEN_APPLICATION_STATUSES },
        })
        .select('programId status submittedAt')
        .limit(10)
        .lean(),
      this.earningsSummary(mentorId),
    ]);

    const openSlots = profile
      ? Math.max(profile.maxActiveMentees - profile.reservedSlots, 0)
      : 0;

    const nowMs = now.getTime();
    const unconfirmedNext7 = unconfirmedSessions.filter(
      (s) =>
        new Date(s.startsAt).getTime() <= nowMs + 7 * DAY_MS && !s.confirmed,
    ).length;
    const expiringProposals24h = openProposals.filter(
      (p) => new Date(p.expiresAt).getTime() <= nowMs + DAY_MS,
    ).length;

    const overdueTasks = openTasks.filter(
      (t) => t.dueAt !== null && new Date(t.dueAt).getTime() < nowMs,
    );
    const dueSoonTasks = openTasks.filter((t) => {
      if (t.dueAt === null) return false;
      const due = new Date(t.dueAt).getTime();
      return due >= nowMs && due <= nowMs + 7 * DAY_MS;
    });
    const tasksSorted = [...openTasks].sort((a, b) => {
      const overdue =
        Number(b.dueAt !== null && new Date(b.dueAt).getTime() < nowMs) -
        Number(a.dueAt !== null && new Date(a.dueAt).getTime() < nowMs);
      if (overdue !== 0) return overdue;
      const rank = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (rank !== 0) return rank;
      return (
        new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()
      );
    });

    const overdueMilestones = milestoneRows.filter(
      (m) =>
        m.status === MilestoneStatus.OVERDUE ||
        (m.status === MilestoneStatus.PENDING &&
          new Date(m.dueAt).getTime() < nowMs),
    );

    const gaps = this.availabilityGaps(upcomingSessions, openSlots, now);

    const guidance: string[] = [];
    if (!profile) {
      guidance.push(
        'No mentorship profile yet — create one with focus areas and a capacity to start receiving matches.',
      );
    } else if (!profile.acceptingMentees) {
      guidance.push(
        'You are marked as not accepting mentees; flip acceptingMentees to welcome new matches.',
      );
    } else if (openSlots === 0) {
      guidance.push(
        'All mentee slots are reserved; close or end an engagement to open capacity.',
      );
    }
    if (upcomingSessions.length === 0) {
      guidance.push(
        'No upcoming sessions in the selected window — schedule one with an active mentee.',
      );
    }
    if (openProposals.length === 0) {
      guidance.push(
        'No open match proposals — you can be proposed by mentees or coordinators at any time.',
      );
    }
    if (openTasks.length === 0) {
      guidance.push(
        'No open tasks — add a task from an engagement to track follow-ups.',
      );
    }

    return {
      meta: {
        scope: { mentorId },
        roleScopedTo: actor.userId === mentorId ? 'self' : 'other',
        window: {
          days: query.days ?? 14,
          from: now.toISOString(),
          to: horizon.toISOString(),
        },
        generatedAt: now.toISOString(),
        counterpartPrivacy: 'opaque user ids only',
      },
      urgentActions: {
        unconfirmedSessionsNext7Days: unconfirmedNext7,
        expiringProposals24h,
        overdueTasks: overdueTasks.length,
        overdueMilestones: overdueMilestones.length,
      },
      upcomingSessions: upcomingSessions.map((s) => ({
        id: String(s._id),
        mentee: counterpartRef(s.menteeId),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        confirmed: s.confirmed,
        topic: s.topic,
      })),
      openProposals: openProposals.map((p) => ({
        id: String(p._id),
        mentee: counterpartRef(p.menteeId),
        programId: p.programId,
        expiresAt: p.expiresAt,
        hoursUntilExpiry:
          Math.round((new Date(p.expiresAt).getTime() - nowMs) / 36000) / 10,
        initiatedBy:
          p.initiator.kind === InitiatorKind.COORDINATOR
            ? 'coordinator'
            : 'participant',
      })),
      myOpenApplications: myApplications.map((a) => ({
        id: String(a._id),
        programId: String(a.programId),
        status: a.status,
        submittedAt: a.submittedAt,
      })),
      activeMentees: {
        count: activeMentees.length,
        capacity: profile ? profile.maxActiveMentees : null,
        openSlots: profile ? openSlots : null,
        acceptingMentees: profile?.acceptingMentees ?? null,
        mentees: activeMentees.map((e) => ({
          engagementId: String(e._id),
          mentee: counterpartRef(e.menteeId),
          programId: e.programId,
          activatedAt: e.activatedAt,
        })),
      },
      tasks: {
        open: openTasks.length,
        overdue: overdueTasks.length,
        dueSoon: dueSoonTasks.length,
        items: tasksSorted.slice(0, 25).map((t) => ({
          id: String(t._id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueAt: t.dueAt,
          engagementId: t.engagementId,
          overdue: t.dueAt !== null && new Date(t.dueAt).getTime() < nowMs,
        })),
      },
      milestones: {
        pending: milestoneRows.length,
        overdue: overdueMilestones.length,
        items: milestoneRows.slice(0, 25).map((m) => ({
          id: String(m._id),
          title: m.title,
          status: m.status,
          dueAt: m.dueAt,
          mentee: counterpartRef(m.menteeId),
        })),
      },
      availability: {
        openSlots,
        acceptingMentees: profile?.acceptingMentees ?? null,
        gaps,
      },
      earnings,
      alerts: {
        unread: unreadAlerts.length,
        unreadCritical,
        items: unreadAlerts.map((a) => ({
          id: String(a._id),
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          createdAt: a.createdAt,
        })),
      },
      guidance,
    };
  }

  /** Days in the next two weeks with no scheduled session while slots are open. */
  private availabilityGaps(
    upcoming: Array<{ startsAt: Date }>,
    openSlots: number,
    now: Date,
  ): Array<{ date: string; reason: string }> {
    if (openSlots <= 0) return [];
    const daysWithSessions = new Set(
      upcoming.map((s) => new Date(s.startsAt).toISOString().slice(0, 10)),
    );
    const gaps: Array<{ date: string; reason: string }> = [];
    for (let i = 1; i <= 14; i += 1) {
      const day = new Date(now.getTime() + i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      if (!daysWithSessions.has(day)) {
        gaps.push({
          date: day,
          reason: 'no sessions scheduled while mentee slots are open',
        });
      }
    }
    return gaps;
  }

  private async earningsSummary(
    mentorId: string,
  ): Promise<Record<string, unknown>> {
    const from = new Date(Date.now() - EARNINGS_WINDOW_DAYS * DAY_MS);
    const rows = await this.sessionModel
      .find({
        mentorId,
        status: OpsSessionStatus.COMPLETED,
        startsAt: { $gte: from },
      })
      .select('feeCents currency payoutStatus startsAt')
      .lean();

    const byCurrency: Record<string, number> = {};
    let totalCents = 0;
    let pendingCents = 0;
    let paidCents = 0;
    for (const row of rows) {
      const currency = row.currency ?? 'usd';
      byCurrency[currency] = (byCurrency[currency] ?? 0) + row.feeCents;
      totalCents += row.feeCents;
      if (row.payoutStatus === PayoutStatus.PENDING)
        pendingCents += row.feeCents;
      if (row.payoutStatus === PayoutStatus.PAID) paidCents += row.feeCents;
    }
    return {
      windowDays: EARNINGS_WINDOW_DAYS,
      sessionCount: rows.length,
      totalCents,
      byCurrency,
      pendingPayoutCents: pendingCents,
      paidCutoffCents: paidCents,
      unreleasedCents: totalCents - pendingCents - paidCents,
      note: 'Earnings are session fees only; smart-contract settlement lines are reported by the payments service.',
    };
  }

  async sessions(
    actor: MentorshipActor,
    query: MentorSessionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor);
    const filter: Record<string, unknown> = { mentorId };
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.startsAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lt: new Date(query.to) } : {}),
      };
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await Promise.all([
      this.sessionModel
        .find(filter)
        .sort({ startsAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.sessionModel.countDocuments(filter),
    ]);
    return {
      meta: { scope: { mentorId }, page, limit, total },
      items: rows.map((s) => ({
        id: String(s._id),
        mentee: counterpartRef(s.menteeId),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        confirmed: s.confirmed,
        attendance: s.attendance,
        topic: s.topic,
        feeCents: s.feeCents,
        currency: s.currency,
        payoutStatus: s.payoutStatus,
      })),
    };
  }

  async tasks(
    actor: MentorshipActor,
    query: MentorSessionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor);
    const filter: Record<string, unknown> = { assigneeId: mentorId };
    if (query.status) filter.status = query.status;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({ dueAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.taskModel.countDocuments(filter),
    ]);
    return {
      meta: { scope: { mentorId }, page, limit, total },
      items: rows.map((t) => ({
        id: String(t._id),
        engagementId: t.engagementId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt,
      })),
    };
  }

  async earnings(
    actor: MentorshipActor,
    query: MentorEarningsQueryDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor);
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - EARNINGS_WINDOW_DAYS * DAY_MS);
    const to = query.to ? new Date(query.to) : new Date();
    const rows = await this.sessionModel
      .find({
        mentorId,
        status: OpsSessionStatus.COMPLETED,
        startsAt: { $gte: from, $lt: to },
      })
      .select('feeCents currency payoutStatus startsAt topic')
      .sort({ startsAt: -1 })
      .limit(1000)
      .lean();

    const byCurrency: Record<string, number> = {};
    let totalCents = 0;
    for (const row of rows) {
      byCurrency[row.currency ?? 'usd'] =
        (byCurrency[row.currency ?? 'usd'] ?? 0) + row.feeCents;
      totalCents += row.feeCents;
    }
    return {
      meta: {
        scope: { mentorId },
        window: { from: from.toISOString(), to: to.toISOString() },
      },
      summary: {
        sessionCount: rows.length,
        totalCents,
        byCurrency,
      },
      sessions: rows.map((s) => ({
        id: String(s._id),
        startsAt: s.startsAt,
        topic: s.topic,
        feeCents: s.feeCents,
        currency: s.currency,
        payoutStatus: s.payoutStatus,
      })),
      reconciles: rows.reduce((sum, s) => sum + s.feeCents, 0) === totalCents,
    };
  }

  async alerts(
    actor: MentorshipActor,
    query: AlertQueryDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor);
    const filter: Record<string, unknown> = { userId: mentorId };
    if (query.unreadOnly) filter.readAt = null;
    const rows = await this.alertModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return {
      meta: { scope: { mentorId } },
      items: rows.map((a) => ({
        id: String(a._id),
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        readAt: a.readAt,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Marks alerts as read. Naturally idempotent: an alert already read keeps
   * its original readAt, and unknown ids surface as 404 so a typo is not
   * silently swallowed.
   */
  async markAlertsRead(
    actor: MentorshipActor,
    dto: ReadAlertsDto,
  ): Promise<Record<string, unknown>> {
    const mentorId = this.resolveMentorId(actor);
    const ids = dto.alertIds ?? [];
    if (ids.length === 0) {
      const result = await this.alertModel.updateMany(
        { userId: mentorId, readAt: null },
        { $set: { readAt: new Date() } },
      );
      return { scope: { mentorId }, marked: result.modifiedCount };
    }
    let marked = 0;
    for (const id of ids) {
      const result = await this.alertModel.updateOne(
        { _id: id, userId: mentorId },
        { $set: { readAt: new Date() } },
      );
      if (result.matchedCount === 0) {
        throw new ResourceNotFoundException(
          `Alert ${id} not found for this mentor`,
          ErrorCode.RES_NOT_FOUND,
        );
      }
      marked += result.modifiedCount;
    }
    return { scope: { mentorId }, marked };
  }
}
