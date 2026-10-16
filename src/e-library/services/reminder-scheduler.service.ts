import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import {
  LibraryPolicy,
  LibraryPolicyDocument,
} from '../schemas/library-policy.schema';
import {
  ReminderPreference,
  ReminderPreferenceDocument,
} from '../schemas/reminder-preference.schema';
import {
  ReminderLog,
  ReminderLogDocument,
  ReminderStatus,
  ReminderType,
} from '../schemas/reminder-log.schema';
import {
  SchedulerJobRun,
  SchedulerJobRunDocument,
} from '../schemas/scheduler-job-run.schema';
import { NotificationService } from '../../notification/notification.service';
import { addDays, isDuplicateKeyError } from '../e-library.util';

const REMINDER_BATCH_SIZE = 200;
const REMINDER_MAX_BATCHES = 10;

const ESCALATION_WINDOWS: Record<number, number> = {
  0: 3,
  1: 1,
  2: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private isRunning = false;

  constructor(
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(LibraryPolicy.name)
    private readonly policyModel: Model<LibraryPolicyDocument>,
    @InjectModel(ReminderPreference.name)
    private readonly prefModel: Model<ReminderPreferenceDocument>,
    @InjectModel(ReminderLog.name)
    private readonly logModel: Model<ReminderLogDocument>,
    @InjectModel(SchedulerJobRun.name)
    private readonly jobRunModel: Model<SchedulerJobRunDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, {
    name: 'e-library-reminder-scheduler',
  })
  async handleScheduledReminders(): Promise<void> {
    await this.runReminderJob('reminder-scheduler');
  }

  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'e-library-reminder-reconciliation',
  })
  async handleReconciliation(): Promise<void> {
    await this.runReminderJob('reminder-reconciliation');
  }

  async runReminderJob(jobName: string) {
    if (this.isRunning) {
      this.logger.warn(`Skipping ${jobName}: a run is already in progress`);
      return { jobName, scanned: 0, sent: 0, suppressed: 0, errors: 0 };
    }

    this.isRunning = true;
    const startedAt = new Date();
    const jobRun = await this.jobRunModel.create({
      jobName,
      startedAt,
      status: 'running',
    });

    let scanned = 0;
    let sent = 0;
    let suppressed = 0;
    let errors = 0;
    const runDate = todayKey();

    try {
      const now = new Date();
      const policy = await this.policyModel.findOne().sort({ createdAt: -1 }).exec();
      const leadDays = policy?.autoRenewalLeadDays ?? 3;

      for (let batch = 0; batch < REMINDER_MAX_BATCHES; batch++) {
        const dueSoonCutoff = addDays(now, leadDays);
        const overdueCutoff = addDays(now, -30);

        const candidates = await this.loanModel
          .find({
            status: { $in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] },
            dueDate: { $lte: dueSoonCutoff, $gte: overdueCutoff },
          })
          .select('_id patronId dueDate status')
          .limit(REMINDER_BATCH_SIZE)
          .lean();

        if (candidates.length === 0) break;
        scanned += candidates.length;

        for (const loan of candidates) {
          try {
            const result = await this.processLoanReminder(loan, now, runDate);
            if (result === 'sent') sent++;
            else suppressed++;
          } catch (err) {
            errors++;
            this.logger.error(
              `Reminder failed for loan ${loan._id}: ${(err as Error).message}`,
            );
          }
        }

        if (candidates.length < REMINDER_BATCH_SIZE) break;
      }

      await this.jobRunModel.updateOne(
        { _id: jobRun._id },
        {
          $set: {
            completedAt: new Date(),
            scannedCount: scanned,
            transitionedCount: sent,
            errorCount: errors,
            status: 'completed',
          },
        },
      );
    } catch (err) {
      await this.jobRunModel.updateOne(
        { _id: jobRun._id },
        {
          $set: {
            completedAt: new Date(),
            scannedCount: scanned,
            transitionedCount: sent,
            errorCount: errors,
            status: 'failed',
            errorMessage: (err as Error).message,
          },
        },
      );
      this.isRunning = false;
      throw err;
    }

    this.isRunning = false;
    return { jobName, scanned, sent, suppressed, errors };
  }

  private async processLoanReminder(
    loan: { _id: unknown; patronId: string; dueDate: Date; status: string },
    now: Date,
    runDate: string,
  ): Promise<'sent' | 'suppressed'> {
    const loanId = loan._id.toString();
    const daysUntilDue = Math.ceil(
      (loan.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    let reminderType: ReminderType;
    let escalationDay: number;

    if (daysUntilDue > 0) {
      reminderType = ReminderType.DUE_SOON;
      const match = Object.entries(ESCALATION_WINDOWS)
        .reverse()
        .find(([_, threshold]) => daysUntilDue <= threshold);
      escalationDay = match ? Number(match[0]) : 0;
    } else {
      reminderType = ReminderType.OVERDUE;
      escalationDay = Math.abs(daysUntilDue);
    }

    const pref = await this.prefModel.findOne({ patronId: loan.patronId }).exec();

    if (pref && !pref.enabled) {
      await this.logModel.create({
        loanId: loan._id,
        patronId: loan.patronId,
        reminderType,
        channel: 'suppressed',
        status: ReminderStatus.SUPPRESSED,
        scheduledAt: now,
        dueDate: loan.dueDate,
        escalationDay,
      });
      return 'suppressed';
    }

    if (pref?.quietHours) {
      const currentHour = now.getHours();
      const { startHour, endHour } = pref.quietHours;
      const inQuietHours =
        startHour > endHour
          ? currentHour >= startHour || currentHour < endHour
          : currentHour >= startHour && currentHour < endHour;

      if (inQuietHours) {
        await this.logModel.create({
          loanId: loan._id,
          patronId: loan.patronId,
          reminderType,
          channel: 'quiet_hours_suppressed',
          status: ReminderStatus.SUPPRESSED,
          scheduledAt: now,
          dueDate: loan.dueDate,
          escalationDay,
        });
        return 'suppressed';
      }
    }

    const alreadySent = await this.logModel
      .findOne({
        loanId: loan._id,
        reminderType,
        escalationDay,
        status: { $in: [ReminderStatus.SENT, ReminderStatus.SCHEDULED] },
        runDate,
      })
      .lean()
      .exec();

    if (alreadySent) {
      return 'suppressed';
    }

    const channel = pref?.channels?.[0] ?? 'in_app';

    try {
      const logEntry = await this.logModel.create({
        loanId: loan._id,
        patronId: loan.patronId,
        reminderType,
        channel,
        status: ReminderStatus.SCHEDULED,
        scheduledAt: now,
        dueDate: loan.dueDate,
        escalationDay,
      });

      const title =
        reminderType === ReminderType.DUE_SOON
          ? 'Book return reminder'
          : 'Overdue book reminder';

      const message =
        reminderType === ReminderType.DUE_SOON
          ? `Your book is due in ${daysUntilDue} day(s). Please return or renew it before ${loan.dueDate.toDateString()}.`
          : `Your book is ${Math.abs(daysUntilDue)} day(s) overdue. Please return it as soon as possible.`;

      await this.notificationService.create({
        userId: loan.patronId,
        title,
        message,
        type: 'library_reminder',
        metadata: { loanId, reminderType, escalationDay },
      });

      await this.logModel.updateOne(
        { _id: logEntry._id },
        { $set: { status: ReminderStatus.SENT, sentAt: new Date() } },
      );

      return 'sent';
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      return 'suppressed';
    }
  }

  async getPreferences(patronId: string): Promise<ReminderPreferenceDocument | null> {
    return this.prefModel.findOne({ patronId }).exec();
  }

  async upsertPreference(
    patronId: string,
    update: { channels?: string[]; quietHours?: unknown; enabled?: boolean },
  ): Promise<ReminderPreferenceDocument> {
    const set: Record<string, unknown> = {};
    if (update.channels !== undefined) set.channels = update.channels;
    if (update.quietHours !== undefined) set.quietHours = update.quietHours;
    if (update.enabled !== undefined) set.enabled = update.enabled;

    const pref = await this.prefModel.findOneAndUpdate(
      { patronId },
      { $set: set, $setOnInsert: { patronId } },
      { new: true, upsert: true },
    );
    return pref;
  }

  async getReminderLogs(query: {
    patronId?: string;
    loanId?: string;
    reminderType?: ReminderType;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<ReminderLogDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.patronId) filter.patronId = query.patronId;
    if (query.loanId) filter.loanId = query.loanId;
    if (query.reminderType) filter.reminderType = query.reminderType;

    if (query.from || query.to) {
      const dateFilter: Record<string, Date> = {};
      if (query.from) dateFilter.$gte = new Date(query.from);
      if (query.to) dateFilter.$lte = new Date(query.to);
      filter.scheduledAt = dateFilter;
    }

    return this.logModel
      .find(filter)
      .sort({ scheduledAt: -1 })
      .limit(query.limit ?? 50)
      .exec();
  }

  async sendManualReminder(loanId: string, reminderType: ReminderType, channel?: string) {
    const loan = await this.loanModel.findById(loanId).lean().exec();
    if (!loan) {
      throw new Error('Loan not found');
    }

    const now = new Date();
    const daysUntilDue = Math.ceil(
      (loan.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    const resolvedChannel = channel ?? 'in_app';

    const title =
      reminderType === ReminderType.DUE_SOON
        ? 'Book return reminder'
        : 'Overdue book reminder';

    const message =
      reminderType === ReminderType.DUE_SOON
        ? `Your book is due in ${daysUntilDue} day(s). Please return or renew it.`
        : `Your book is ${Math.abs(daysUntilDue)} day(s) overdue. Please return it.`;

    const logEntry = await this.logModel.create({
      loanId: loan._id,
      patronId: loan.patronId,
      reminderType,
      channel: resolvedChannel,
      status: ReminderStatus.SCHEDULED,
      scheduledAt: now,
      dueDate: loan.dueDate,
      escalationDay: 0,
    });

    await this.notificationService.create({
      userId: loan.patronId,
      title,
      message,
      type: 'library_reminder',
      metadata: { loanId: loan._id.toString(), reminderType, manual: true },
    });

    await this.logModel.updateOne(
      { _id: logEntry._id },
      { $set: { status: ReminderStatus.SENT, sentAt: new Date() } },
    );

    return { loanId, reminderType, channel: resolvedChannel, status: 'sent' };
  }

  async getRecentRuns(jobName?: string, limit = 20): Promise<SchedulerJobRunDocument[]> {
    const filter = jobName ? { jobName } : {};
    return this.jobRunModel
      .find(filter)
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
  }
}
