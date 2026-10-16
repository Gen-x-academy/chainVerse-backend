import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { NotificationService } from '../notification/notification.service';
import {
  ApplicantReasonCode,
  DecisionType,
  NotificationDispatchStatus,
} from './enums/mentorship.enums';
import {
  MentorshipDecisionNotification,
  MentorshipDecisionNotificationDocument,
} from './schemas/mentorship-decision-notification.schema';
import { MentorshipTelemetry } from './telemetry/mentorship.telemetry';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const LEASE_MS = 2 * 60_000;

const TITLES: Record<DecisionType, string> = {
  [DecisionType.ACCEPT]: 'Mentorship application accepted',
  [DecisionType.REJECT]: 'Mentorship application update',
  [DecisionType.WAITLIST]: 'You are on the mentorship waitlist',
  [DecisionType.REQUEST_INFORMATION]:
    'More information needed for your mentorship application',
  [DecisionType.WITHDRAW]: 'Mentorship application withdrawn',
};

/**
 * Delivers decision notifications from the outbox once they are due.
 *
 * Rows are claimed one at a time with a lease, so several instances can run
 * the job concurrently without double-sending, and a crashed worker's claim
 * expires and is retried. Delivery is at-least-once; the notification
 * metadata carries `decisionId` so consumers can de-duplicate.
 */
@Injectable()
export class MentorshipDecisionDispatcher {
  private readonly logger = new Logger(MentorshipDecisionDispatcher.name);
  private running = false;

  constructor(
    @InjectModel(MentorshipDecisionNotification.name)
    private readonly outbox: Model<MentorshipDecisionNotificationDocument>,
    private readonly notificationService: NotificationService,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  @Interval('mentorship-decision-dispatch', 30_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchDue();
    } catch (error) {
      this.logger.error(
        `Decision dispatch failed: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Processes up to one batch of due notifications; returns how many ran. */
  async dispatchDue(now = new Date()): Promise<number> {
    let processed = 0;
    while (processed < BATCH_SIZE) {
      const row = await this.claimNext(now);
      if (!row) break;
      processed += 1;
      await this.deliver(row);
    }
    return processed;
  }

  private claimNext(now: Date) {
    return this.outbox
      .findOneAndUpdate(
        {
          dispatchAfter: { $lte: now },
          attempts: { $lt: MAX_ATTEMPTS },
          $or: [
            { status: NotificationDispatchStatus.PENDING },
            { status: NotificationDispatchStatus.FAILED },
            {
              status: NotificationDispatchStatus.DISPATCHING,
              lockedUntil: { $lt: now },
            },
          ],
        },
        {
          $set: {
            status: NotificationDispatchStatus.DISPATCHING,
            lockedUntil: new Date(now.getTime() + LEASE_MS),
          },
          $inc: { attempts: 1 },
        },
        { sort: { dispatchAfter: 1 }, returnDocument: 'after' },
      )
      .exec();
  }

  private async deliver(row: MentorshipDecisionNotificationDocument) {
    try {
      await this.notificationService.create({
        userId: row.applicantId.toString(),
        title: TITLES[row.decisionType],
        message: buildMessage(row),
        type: 'mentorship_application',
        metadata: {
          applicationId: row.applicationId.toString(),
          decisionId: row.decisionId.toString(),
          decisionType: row.decisionType,
          reasonCode: row.applicantReasonCode,
        },
      });
      await this.outbox
        .updateOne(
          { _id: row._id },
          {
            $set: {
              status: NotificationDispatchStatus.SENT,
              sentAt: new Date(),
              lockedUntil: null,
              lastError: null,
            },
          },
        )
        .exec();
      this.telemetry.notificationProcessed('sent', row.decisionId.toString());
    } catch (error) {
      await this.outbox
        .updateOne(
          { _id: row._id },
          {
            $set: {
              status: NotificationDispatchStatus.FAILED,
              lockedUntil: null,
              lastError: String((error as Error)?.message ?? error).slice(
                0,
                500,
              ),
            },
          },
        )
        .exec();
      this.telemetry.notificationProcessed('failed', row.decisionId.toString());
    }
  }
}

function buildMessage(row: MentorshipDecisionNotification): string {
  const lead: Record<DecisionType, string> = {
    [DecisionType.ACCEPT]: `You have been accepted into "${row.programTitle}".`,
    [DecisionType.REJECT]: `Your application to "${row.programTitle}" was not successful this time.`,
    [DecisionType.WAITLIST]: `Your application to "${row.programTitle}" has been waitlisted.`,
    [DecisionType.REQUEST_INFORMATION]: `The mentor for "${row.programTitle}" needs more information before deciding.`,
    [DecisionType.WITHDRAW]: `Your application to "${row.programTitle}" has been withdrawn.`,
  };
  const reason =
    row.applicantReasonCode &&
    row.applicantReasonCode !== ApplicantReasonCode.OTHER
      ? ` Reason: ${row.applicantReasonCode.replace(/_/g, ' ')}.`
      : '';
  const note = row.applicantMessage ? ` ${row.applicantMessage}` : '';
  return `${lead[row.decisionType]}${reason}${note}`;
}
