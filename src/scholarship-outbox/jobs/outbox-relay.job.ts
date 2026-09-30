import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from '../services/outbox.service';

/** Rows per pass. Enough to drain a burst, small enough to stay a single query. */
export const OUTBOX_BATCH_SIZE = 200;

/**
 * Drains the transactional outbox onto the in-process event bus.
 *
 * Two triggers, deliberately:
 *
 *   - **every 10 seconds**, so events raised outside a request (the expiry
 *     crons, the reconcilers) reach their listeners promptly rather than after
 *     a five-minute sweep;
 *   - **once at bootstrap**, so rows staged while no relay was running — a
 *     deploy gap, a crashed pod, or events written by an older version whose
 *     relay had not shipped yet — publish without waiting a full tick.
 *
 * The relay is safe to run in every replica: `OutboxService.publishDue` claims
 * each row with a conditional update, so overlapping ticks and instances contend
 * for a row rather than both delivering it. There is no distributed lock
 * because there is nothing to serialise — that is the point of making delivery
 * claim-based rather than lease-based.
 *
 * Operational impact: `GET /health/ready` reports `isTransactional` and the
 * outbox backlog age, so a degraded deployment or a stuck listener is visible
 * before it becomes a missed disbursement.
 */
@Injectable()
export class OutboxRelayJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxRelayJob.name);
  private running = false;

  constructor(private readonly outbox: OutboxService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.drain('bootstrap');
  }

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'scholarship-outbox-relay' })
  async relay(): Promise<void> {
    await this.drain('cron');
  }

  private async drain(trigger: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let total = 0;
      // Drain in batches so a burst larger than one batch is not left for the
      // next tick; the loop stops as soon as a pass publishes nothing.
      for (let pass = 0; pass < 10; pass++) {
        const published = await this.outbox.publishDue(OUTBOX_BATCH_SIZE);
        total += published;
        if (published < OUTBOX_BATCH_SIZE) break;
      }
      if (total > 0) {
        this.logger.log(
          `Outbox relay [${trigger}] published ${total} event(s)`,
        );
      }
    } catch (error) {
      // Never let a relay failure kill the process: the rows stay PENDING and the
      // next tick retries them with backoff.
      this.logger.error(
        `Outbox relay [${trigger}] failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
