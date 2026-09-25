import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EmailService } from './email.service';

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface QueuedJob {
  job: EmailJob;
  attempts: number;
  nextRetryAt: number;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 2_000; // 2 s, doubles each retry
const POLL_INTERVAL_MS = 5_000;

/**
 * EmailJobService - wraps EmailService with a simple in-process retry queue.
 *
 * Jobs that fail transiently are retried up to MAX_ATTEMPTS times with
 * exponential back-off. Jobs that exhaust all attempts are moved to the
 * dead-letter store so they can be inspected or replayed.
 *
 * For issue #927: add durable email delivery jobs with retry and dead-letter
 * handling.
 */
@Injectable()
export class EmailJobService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailJobService.name);
  private readonly queue: QueuedJob[] = [];
  private readonly deadLetter: { job: EmailJob; reason: string }[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly emailService: EmailService) {
    this.pollTimer = setInterval(() => this.flush(), POLL_INTERVAL_MS);
  }

  /** Enqueue an email for delivery with automatic retry on failure. */
  enqueue(job: EmailJob): void {
    this.queue.push({ job, attempts: 0, nextRetryAt: Date.now() });
    this.logger.log(`Email job queued for ${job.to}: "${job.subject}"`);
  }

  /** Returns a read-only snapshot of current dead-letter entries. */
  getDeadLetter(): ReadonlyArray<{ job: EmailJob; reason: string }> {
    return this.deadLetter;
  }

  /** Drain due jobs. Called automatically on an interval and can be called manually in tests. */
  async flush(): Promise<void> {
    const now = Date.now();
    const due = this.queue.filter((q) => q.nextRetryAt <= now);

    for (const item of due) {
      try {
        await this.emailService.send(item.job.to, item.job.subject, item.job.text);
        this.queue.splice(this.queue.indexOf(item), 1);
        this.logger.log(`Email delivered to ${item.job.to} after ${item.attempts + 1} attempt(s)`);
      } catch (err: unknown) {
        item.attempts += 1;
        if (item.attempts >= MAX_ATTEMPTS) {
          const reason = err instanceof Error ? err.message : String(err);
          this.deadLetter.push({ job: item.job, reason });
          this.queue.splice(this.queue.indexOf(item), 1);
          this.logger.error(
            `Email to ${item.job.to} dead-lettered after ${item.attempts} attempt(s): ${reason}`,
          );
        } else {
          item.nextRetryAt = Date.now() + BACKOFF_BASE_MS * 2 ** (item.attempts - 1);
          this.logger.warn(
            `Email to ${item.job.to} failed (attempt ${item.attempts}/${MAX_ATTEMPTS}), retrying in ${item.nextRetryAt - Date.now()}ms`,
          );
        }
      }
    }
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}