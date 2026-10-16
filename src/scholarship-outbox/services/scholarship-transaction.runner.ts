import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

/** The unit of work a caller wants committed atomically. */
export type ScholarshipUnitOfWork<T> = (
  session: ClientSession | null,
) => Promise<T>;

/**
 * Binds a Mongoose query to the ambient transaction, if there is one.
 *
 * Mongoose treats `query.session(null)` and "no session" the same way, but being
 * explicit keeps the degraded path obviously non-transactional to a reader: the
 * only place `null` can enter is the `if (session)` branch, which is exactly
 * where the atomicity guarantee lapses.
 */
export function withSession<
  T extends { session(session: ClientSession | null): T },
>(query: T, session: ClientSession | null): T {
  return session ? query.session(session) : query;
}

/**
 * Whether the deployment can actually roll back a multi-document write.
 *
 *   `transactional` — a replica set or mongos is reachable; `session` is a live
 *                     transaction and every write in it commits or aborts as a
 *                     unit.
 *   `degraded`       — a standalone mongod. `session` is `null`, writes are NOT
 *                     atomic across documents, and the caller must rely on the
 *                     outbox for reconciliation instead of on rollback.
 *   `unknown`        — nothing has run yet.
 */
export type ScholarshipTransactionMode =
  | 'transactional'
  | 'degraded'
  | 'unknown';

/**
 * Runs a scholarship cross-module transition inside a Mongo transaction.
 *
 * ## Why this exists
 *
 * Award approval, reservation consumption, milestone approval and disbursement
 * intent creation each touch two or more collections. Those writes used to be a
 * read-modify-write sequence with hand-written compensation, which means a crash
 * between step two and step three left the authoritative state half-moved: a
 * `BudgetLedger` with an inflated `reservedAmount` and no reservation to justify
 * it, or a milestone stuck in `APPROVED` with no decision row. Neither is
 * repairable, because the compensating write is precisely the one that was lost.
 *
 * ## Why it differs from `LibraryTransactionRunner`
 *
 * That runner treats "this deployment has no transactions" as an expected
 * condition and silently degrades, which is right for a library loan checkout
 * where losing a hold is recoverable by re-running the request. It is wrong here:
 * a degraded scholarship write is a financial divergence. So this runner
 *
 *   1. probes transaction support once and remembers the answer, rather than
 *      paying a failed round-trip on every request;
 *   2. logs the downgrade at `error` level, because it means the atomicity
 *      guarantee this issue asks for is **not** in force and the outbox is the
 *      only thing standing between a crash and a corrupt ledger;
 *   3. still runs the work in degraded mode, so a standalone development
 *      database keeps working — degraded and loud rather than broken and quiet.
 *
 * Callers are expected to stage their outbox row regardless of mode: in
 * `transactional` mode it is what makes publication durable, and in `degraded`
 * mode it is the only record that a transition was attempted.
 *
 * ## Retries
 *
 * `withTransaction` retries the callback on `TransientTransactionError`, which
 * means `work` may run more than once. Every caller is therefore written to be
 * idempotent (deterministic keys and unique indexes), never to accumulate state
 * in a closure across invocations.
 */
@Injectable()
export class ScholarshipTransactionRunner {
  private readonly logger = new Logger(ScholarshipTransactionRunner.name);
  private mode: ScholarshipTransactionMode = 'unknown';

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** True when `run` is handing out a live transaction. Exposed for health checks. */
  get isTransactional(): boolean {
    return this.mode === 'transactional';
  }

  /**
   * Runs `work` atomically, or degraded-but-loudly when the deployment cannot
   * roll back. Never throws for the *absence* of transactions; every other error
   * from `work` propagates unchanged, which is what aborts the transaction.
   *
   * @param label Short identifier used in logs and in the downgrade warning.
   * @param work  The unit of work. Must be safe to run more than once.
   */
  async run<T>(label: string, work: ScholarshipUnitOfWork<T>): Promise<T> {
    if (this.mode === 'degraded') {
      return work(null);
    }

    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      this.mode = 'transactional';
      return result as T;
    } catch (error) {
      if (!this.isUnsupportedTransactionError(error)) throw error;

      // The session may or may not have started a transaction; either way it
      // cannot be reused, so drop it before running the fallback path.
      await session.endSession().catch(() => undefined);
      this.degrade(label, error);
      return work(null);
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  /**
   * Recognises the "you asked for a transaction and this deployment has none"
   * family of server errors. Deliberately narrow: anything else — a write
   * conflict, a validation failure, a domain exception — is a real error and
   * must propagate rather than be retried outside the transaction, which would
   * hide the partial write the transaction was there to prevent.
   */
  private isUnsupportedTransactionError(error: unknown): boolean {
    // Once we have seen a transaction succeed, the deployment supports them, so
    // an error of this shape later is a genuine fault, not a capability probe.
    if (this.mode === 'transactional') return false;

    const message = error instanceof Error ? error.message : String(error);
    const codeName = (error as { codeName?: string } | null)?.codeName;
    return (
      codeName === 'IllegalOperation' ||
      /transaction numbers are only allowed on a replica set/i.test(message) ||
      /Transaction numbers are only allowed/i.test(message) ||
      /transactions are not supported/i.test(message) ||
      /does not support transactions/i.test(message) ||
      /This MongoDB deployment does not support retryable writes/i.test(message)
    );
  }

  private degrade(label: string, cause: unknown): void {
    this.mode = 'degraded';
    const reason = cause instanceof Error ? cause.message : String(cause);
    this.logger.error(
      `MongoDB deployment does not support transactions. "${label}" ran ` +
        `non-atomically: a failure part-way through can leave the budget ledger, ` +
        `reservations, milestone progress and payment eligibility mutually ` +
        `inconsistent. The transactional outbox still records every attempted ` +
        `transition, so divergence is detected and repaired by reconciliation — ` +
        `but production must run a replica set. Cause: ${reason}`,
    );
  }
}
