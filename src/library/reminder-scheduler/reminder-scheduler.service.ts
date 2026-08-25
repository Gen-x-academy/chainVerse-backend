import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ReminderDeliveryLog,
  ReminderDeliveryLogDocument,
} from './schemas/reminder-delivery-log.schema';
import { LibraryEvents } from '../events/library-event-names';
import { ItemDueSoonPayload } from '../events/payloads/item-due-soon.payload';
import { ItemOverduePayload } from '../events/payloads/item-overdue.payload';

interface ActiveLoan {
  loanId: string;
  patronId: string;
  itemId: string;
  dueAt: Date;
  returnedAt?: Date | null;
}

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectModel(ReminderDeliveryLog.name)
    private readonly logModel: Model<ReminderDeliveryLogDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Due-soon check — runs every hour.
   * Emits ITEM_DUE_SOON for loans due within 48 h that have not yet
   * received a due-soon reminder.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendDueSoonReminders(): Promise<void> {
    const loans = await this.fetchActiveLoans({ dueSoonWindowHours: 48 });
    for (const loan of loans) {
      const hoursRemaining = this.hoursUntil(loan.dueAt);
      const windowKey = hoursRemaining <= 24 ? '24h' : '48h';
      const idempotencyKey = `${loan.loanId}:due-soon:${windowKey}`;

      const alreadySent = await this.logModel.exists({ idempotencyKey });
      if (alreadySent) continue;

      await this.logModel.create({
        loanId: loan.loanId,
        patronId: loan.patronId,
        type: 'due-soon',
        idempotencyKey,
        status: 'pending',
      });

      const payload: ItemDueSoonPayload = {
        loanId: loan.loanId,
        patronId: loan.patronId,
        itemId: loan.itemId,
        dueAt: loan.dueAt.toISOString(),
        hoursRemaining,
      };

      try {
        await this.eventEmitter.emitAsync(LibraryEvents.ITEM_DUE_SOON, payload);
        await this.logModel.updateOne({ idempotencyKey }, { status: 'sent' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Due-soon reminder failed for loan ${loan.loanId}: ${message}`);
        await this.logModel.updateOne(
          { idempotencyKey },
          { status: 'skipped', failureReason: message },
        );
      }
    }
  }

  /**
   * Overdue check — runs every 6 hours.
   * Emits ITEM_OVERDUE for loans past their due date that have not yet
   * received an overdue reminder for the current 24-h escalation window.
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async sendOverdueReminders(): Promise<void> {
    const loans = await this.fetchOverdueLoans();
    for (const loan of loans) {
      const hoursOverdue = this.hoursElapsedSince(loan.dueAt);
      const escalationWindow = Math.floor(hoursOverdue / 24);
      const idempotencyKey = `${loan.loanId}:overdue:day${escalationWindow}`;

      const alreadySent = await this.logModel.exists({ idempotencyKey });
      if (alreadySent) continue;

      await this.logModel.create({
        loanId: loan.loanId,
        patronId: loan.patronId,
        type: 'overdue',
        idempotencyKey,
        status: 'pending',
      });

      const payload: ItemOverduePayload = {
        loanId: loan.loanId,
        patronId: loan.patronId,
        itemId: loan.itemId,
        dueAt: loan.dueAt.toISOString(),
        hoursOverdue,
      };

      try {
        await this.eventEmitter.emitAsync(LibraryEvents.ITEM_OVERDUE, payload);
        await this.logModel.updateOne({ idempotencyKey }, { status: 'sent' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Overdue reminder failed for loan ${loan.loanId}: ${message}`);
        await this.logModel.updateOne(
          { idempotencyKey },
          { status: 'skipped', failureReason: message },
        );
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Stub: replace with an actual query against the loan collection.
   * Returns loans whose dueAt is within the next `dueSoonWindowHours` hours
   * and that have not been returned yet.
   */
  private async fetchActiveLoans(_opts: {
    dueSoonWindowHours: number;
  }): Promise<ActiveLoan[]> {
    return [];
  }

  /** Stub: replace with a query for loans where dueAt < now and returnedAt is null. */
  private async fetchOverdueLoans(): Promise<ActiveLoan[]> {
    return [];
  }

  private hoursUntil(date: Date): number {
    return Math.max(0, (date.getTime() - Date.now()) / 3_600_000);
  }

  private hoursElapsedSince(date: Date): number {
    return Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
  }
}