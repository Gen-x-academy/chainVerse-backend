import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import { ValidationDomainException } from '../../../common/errors/domain.exception';
import {
  OPEN_PROPOSAL_STATUSES,
  ParticipantRole,
  ProposalStatus,
} from '../../mentorship.constants';
import { MatchProposal } from '../../schemas/match-proposal.schema';
import { MentorshipProfile } from '../../schemas/mentorship-profile.schema';
import {
  AlertSeverity,
  AlertType,
  JobRunStatus,
  MilestoneStatus,
  OpsJob,
  OpsSessionStatus,
  OpsTaskStatus,
} from '../enums/mentorship-operations.enums';
import { MentorshipAlert } from '../schemas/mentorship-alert.schema';
import { MentorshipOpsMilestone } from '../schemas/mentorship-ops-milestone.schema';
import { MentorshipOpsJobRun } from '../schemas/mentorship-ops-job-run.schema';
import { MentorshipSession } from '../schemas/mentorship-session.schema';
import { MentorshipTask } from '../schemas/mentorship-task.schema';

const SWEEP_BATCH = 500;
const EXPIRING_SOON_HOURS = 24;

/**
 * Background mentorship operations workflow (shared by MENTOR-114/115/116).
 *
 * Three idempotent sweeps back every stale flag and alert the dashboards
 * report:
 *  - expire proposals past their expiry (releasing capacity) and warn about
 *    proposals expiring soon;
 *  - flip pending milestones past due to overdue and alert the mentor;
 *  - alert both sides about unconfirmed sessions starting soon and mentors
 *    about overdue tasks.
 *
 * Every effect is guarded by a unique alert dedupe key or a conditional
 * update, so overlapping runs (or a manual re-trigger) never duplicate.
 * Each run is recorded in the ops job-run ledger the dashboards read for
 * freshness/staleness.
 */
@Injectable()
export class MentorshipOpsWorkflowService {
  private readonly logger = new Logger(MentorshipOpsWorkflowService.name);

  constructor(
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposal>,
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfile>,
    @InjectModel(MentorshipOpsMilestone.name)
    private readonly milestoneModel: Model<MentorshipOpsMilestone>,
    @InjectModel(MentorshipSession.name)
    private readonly sessionModel: Model<MentorshipSession>,
    @InjectModel(MentorshipTask.name)
    private readonly taskModel: Model<MentorshipTask>,
    @InjectModel(MentorshipAlert.name)
    private readonly alertModel: Model<MentorshipAlert>,
    @InjectModel(MentorshipOpsJobRun.name)
    private readonly jobRunModel: Model<MentorshipOpsJobRun>,
  ) {}

  @Cron(process.env.MENTORSHIP_OPS_CRON ?? '*/15 * * * *')
  async handleCron(): Promise<void> {
    if (process.env.MENTORSHIP_OPS_JOBS_DISABLED === 'true') return;
    await this.runAll();
  }

  async runAll(): Promise<Record<OpsJob, Record<string, number>>> {
    return {
      [OpsJob.EXPIRE_PROPOSALS]: await this.run(OpsJob.EXPIRE_PROPOSALS, () =>
        this.expireProposals(),
      ),
      [OpsJob.MILESTONE_REMINDERS]: await this.run(
        OpsJob.MILESTONE_REMINDERS,
        () => this.milestoneReminders(),
      ),
      [OpsJob.SCHEDULE_RISK_SWEEP]: await this.run(
        OpsJob.SCHEDULE_RISK_SWEEP,
        () => this.scheduleRiskSweep(),
      ),
    };
  }

  /** Manual trigger (admin-only endpoint) for recovery and tests. */
  async runJob(job: OpsJob): Promise<Record<string, number>> {
    switch (job) {
      case OpsJob.EXPIRE_PROPOSALS:
        return this.run(job, () => this.expireProposals());
      case OpsJob.MILESTONE_REMINDERS:
        return this.run(job, () => this.milestoneReminders());
      case OpsJob.SCHEDULE_RISK_SWEEP:
        return this.run(job, () => this.scheduleRiskSweep());
      default:
        throw new ValidationDomainException(
          `Unknown job "${job}"`,
          ErrorCode.VAL_INVALID_INPUT,
        );
    }
  }

  private async run(
    job: OpsJob,
    fn: () => Promise<Record<string, number>>,
  ): Promise<Record<string, number>> {
    const startedAt = new Date();
    let summary: Record<string, number> = {};
    try {
      summary = await fn();
      await this.jobRunModel.create({
        job,
        startedAt,
        finishedAt: new Date(),
        status: JobRunStatus.SUCCESS,
        summary,
        error: null,
      });
      this.logger.log(`ops job ${job} ok ${JSON.stringify(summary)}`);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobRunModel.create({
        job,
        startedAt,
        finishedAt: new Date(),
        status: JobRunStatus.FAILED,
        summary,
        error: message.slice(0, 500),
      });
      this.logger.error(`ops job ${job} failed: ${message}`);
      throw error;
    }
  }

  /** Expire overdue open proposals; warn on proposals expiring soon. */
  async expireProposals(): Promise<Record<string, number>> {
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_HOURS * 3600000);

    let expired = 0;
    const overdue = await this.proposalModel
      .find({
        status: { $in: [...OPEN_PROPOSAL_STATUSES] },
        expiresAt: { $lt: now },
      })
      .limit(SWEEP_BATCH)
      .select('_id mentorId menteeId programId capacityReserved')
      .lean();

    for (const proposal of overdue) {
      const closed = await this.proposalModel.updateOne(
        { _id: proposal._id, status: { $in: [...OPEN_PROPOSAL_STATUSES] } },
        {
          $set: {
            status: ProposalStatus.EXPIRED,
            closedBy: 'system',
            closedReason: 'expired',
            closedAt: now,
          },
          $unset: { openKey: 1 },
          $push: {
            history: {
              action: 'expire',
              actorId: 'system',
              actorRole: null,
              reason: 'expired',
              termsVersion: null,
              at: now,
            },
          },
        },
      );
      if (closed.modifiedCount === 0) continue;
      expired += 1;

      if (proposal.capacityReserved) {
        const cleared = await this.proposalModel.updateOne(
          { _id: proposal._id, capacityReserved: true },
          { $set: { capacityReserved: false } },
        );
        if (cleared.modifiedCount === 1) {
          await this.profileModel.updateOne(
            {
              userId: proposal.mentorId,
              kind: ParticipantRole.MENTOR,
              reservedSlots: { $gt: 0 },
            },
            { $inc: { reservedSlots: -1 } },
          );
        }
      }
      for (const userId of [proposal.mentorId, proposal.menteeId]) {
        await this.upsertAlert({
          dedupeKey: `proposal_expired:${String(proposal._id)}:${userId}`,
          userId,
          programId: proposal.programId,
          engagementId: null,
          type: AlertType.PROPOSAL_EXPIRED,
          severity: AlertSeverity.WARNING,
          title: 'A match proposal expired',
          message:
            'The proposal was not answered before its expiry and is now closed.',
        });
      }
    }

    const expiring = await this.proposalModel
      .find({
        status: { $in: [...OPEN_PROPOSAL_STATUSES] },
        expiresAt: { $gte: now, $lte: soon },
      })
      .limit(SWEEP_BATCH)
      .select('_id mentorId menteeId programId')
      .lean();
    let warned = 0;
    for (const proposal of expiring) {
      for (const userId of [proposal.mentorId, proposal.menteeId]) {
        const result = await this.upsertAlert({
          dedupeKey: `proposal_expiring:${String(proposal._id)}:${userId}`,
          userId,
          programId: proposal.programId,
          engagementId: null,
          type: AlertType.PROPOSAL_EXPIRING,
          severity: AlertSeverity.INFO,
          title: 'A match proposal expires within 24 hours',
          message:
            'Answer the proposal before it expires or it will close automatically.',
        });
        if (result) warned += 1;
      }
    }
    return { expired, expiringWarned: warned };
  }

  /** Flip overdue pending milestones and alert the mentor once each. */
  async milestoneReminders(): Promise<Record<string, number>> {
    const now = new Date();
    const overdue = await this.milestoneModel
      .find({ status: MilestoneStatus.PENDING, dueAt: { $lt: now } })
      .limit(SWEEP_BATCH)
      .select('_id mentorId programId engagementId title')
      .lean();
    let flipped = 0;
    let alerted = 0;
    for (const milestone of overdue) {
      const updated = await this.milestoneModel.updateOne(
        { _id: milestone._id, status: MilestoneStatus.PENDING },
        { $set: { status: MilestoneStatus.OVERDUE } },
      );
      if (updated.modifiedCount === 1) flipped += 1;
      const inserted = await this.upsertAlert({
        dedupeKey: `milestone_overdue:${String(milestone._id)}`,
        userId: milestone.mentorId,
        programId: milestone.programId,
        engagementId: milestone.engagementId,
        type: AlertType.MILESTONE_OVERDUE,
        severity: AlertSeverity.WARNING,
        title: 'A milestone is overdue',
        message: `"${milestone.title}" passed its due date.`,
      });
      if (inserted) alerted += 1;
    }
    return { overdueMilestones: flipped, alerted };
  }

  /** Alert both sides about unconfirmed sessions and mentors about overdue tasks. */
  async scheduleRiskSweep(): Promise<Record<string, number>> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 48 * 3600000);
    let sessionAlerts = 0;
    const sessions = await this.sessionModel
      .find({
        status: OpsSessionStatus.SCHEDULED,
        confirmed: false,
        startsAt: { $gte: now, $lte: horizon },
      })
      .limit(SWEEP_BATCH)
      .select('_id mentorId menteeId programId startsAt topic')
      .lean();
    for (const session of sessions) {
      for (const userId of [session.mentorId, session.menteeId]) {
        const inserted = await this.upsertAlert({
          dedupeKey: `session_unconfirmed:${String(session._id)}:${userId}`,
          userId,
          programId: session.programId,
          engagementId: null,
          type: AlertType.SESSION_UNCONFIRMED,
          severity: AlertSeverity.WARNING,
          title: 'A session starts soon and is unconfirmed',
          message: `"${session.topic}" starts ${session.startsAt.toISOString()} and still needs confirmation.`,
        });
        if (inserted) sessionAlerts += 1;
      }
    }

    let taskAlerts = 0;
    const tasks = await this.taskModel
      .find({
        status: { $in: [OpsTaskStatus.OPEN, OpsTaskStatus.IN_PROGRESS] },
        dueAt: { $lt: now },
      })
      .limit(SWEEP_BATCH)
      .select('_id assigneeId programId engagementId title')
      .lean();
    for (const task of tasks) {
      const inserted = await this.upsertAlert({
        dedupeKey: `task_overdue:${String(task._id)}`,
        userId: task.assigneeId,
        programId: task.programId,
        engagementId: task.engagementId,
        type: AlertType.TASK_OVERDUE,
        severity: AlertSeverity.INFO,
        title: 'A task is overdue',
        message: `"${task.title}" passed its due date.`,
      });
      if (inserted) taskAlerts += 1;
    }
    return { sessionAlerts, taskAlerts };
  }

  /** Returns true when a new alert was created, false when deduped. */
  private async upsertAlert(alert: {
    dedupeKey: string;
    userId: string;
    programId: string | null;
    engagementId: string | null;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
  }): Promise<boolean> {
    const result = await this.alertModel.updateOne(
      { dedupeKey: alert.dedupeKey },
      {
        $setOnInsert: {
          userId: alert.userId,
          programId: alert.programId,
          engagementId: alert.engagementId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          readAt: null,
        },
      },
      { upsert: true },
    );
    return result.upsertedCount === 1;
  }
}
