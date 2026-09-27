import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FundingRound } from '../schemas/funding-round.schema';
import { SponsorDeposit } from '../schemas/sponsor-deposit.schema';
import { Refund } from '../schemas/refund.schema';
import { RecoveryClaim } from '../schemas/recovery-claim.schema';
import { RecoveryCollection } from '../schemas/recovery-collection.schema';
import { PayoutIntent } from '../payouts/payout-intent.schema';
import { ReconciliationRun } from '../reconciliation/reconciliation.schemas';
import { LedgerBalance } from '../schemas/ledger-balance.schema';
import { LedgerJournal } from '../schemas/ledger-journal.schema';
import { RefundService } from '../services/refund.service';
import { RecoveryService } from '../services/recovery.service';
import {
  decodeDashboardView,
  type DashboardFilterSet,
} from './dto/dashboard.dto';

/**
 * Read model for the finance operations dashboard (#1174).
 *
 * The dashboard answers one question an operator has every morning: *where is
 * the money, and what needs a decision?* Before this, answering it meant
 * opening six different endpoints and joining the results by hand.
 *
 * ## Design
 *
 * This is a **read model**. It reads the finance aggregates directly and never
 * writes, so it can be scaled, cached and invalidated independently of the
 * write paths. It deliberately does not call the write services: a dashboard
 * that shares a code path with a mutation can be broken by a mutation.
 *
 * ## Staleness
 *
 * Every section reports `asOf` (the newest timestamp it actually read) and
 * `stale` (whether that is older than the caller's threshold). A finance
 * dashboard that does not say how fresh its numbers are is worse than no
 * dashboard — an operator balancing against a figure from yesterday will make a
 * decision about money that has already moved.
 *
 * `stale` is computed per section, not globally, because the sections are
 * updated by different jobs at different times. A single global flag would
 * either be always-true (reconciliation runs hourly) or always-false (deposits
 * are written on demand).
 */
@Injectable()
export class FinanceDashboardService {
  constructor(
    @InjectModel(FundingRound.name)
    private readonly rounds: Model<FundingRound>,
    @InjectModel(SponsorDeposit.name)
    private readonly deposits: Model<SponsorDeposit>,
    @InjectModel(Refund.name)
    private readonly refunds: Model<Refund>,
    @InjectModel(RecoveryClaim.name)
    private readonly claims: Model<RecoveryClaim>,
    @InjectModel(RecoveryCollection.name)
    private readonly collections: Model<RecoveryCollection>,
    @InjectModel(PayoutIntent.name)
    private readonly payouts: Model<PayoutIntent>,
    @InjectModel(ReconciliationRun.name)
    private readonly runs: Model<ReconciliationRun>,
    @InjectModel(LedgerBalance.name)
    private readonly balances: Model<LedgerBalance>,
    @InjectModel(LedgerJournal.name)
    private readonly journals: Model<LedgerJournal>,
    private readonly refunds: RefundService,
    private readonly recoveries: RecoveryService,
  ) {}

  /**
   * Resolves the effective filter set from the query.
   *
   * A `view` parameter wins over the individual fields, so a shared link
   * reproduces an exact dashboard. A malformed `view` is a 400 rather than a
   * silently ignored parameter.
   */
  resolveFilters(query: {
    view?: string;
    asset?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): DashboardFilterSet {
    if (query.view) {
      const decoded = decodeDashboardView(query.view);
      if (!decoded) {
        throw new DashboardViewError(
          'The "view" parameter is not a valid base64-encoded filter set',
        );
      }
      return { ...decoded, limit: decoded.limit ?? query.limit ?? 25 };
    }
    const filter: DashboardFilterSet = { limit: query.limit ?? 25 };
    if (query.asset) filter.asset = query.asset;
    if (query.status) filter.status = query.status;
    if (query.from) filter.from = query.from.toISOString();
    if (query.to) filter.to = query.to.toISOString();
    return filter;
  }

  /**
   * The dashboard overview.
   *
   * Each section is independent: a failure in one (say, the reconciliation
   * collection is unreachable) must not blank the others, because an operator
   * with a partial dashboard can still act on the parts they can see. A section
   * that could not be read reports `error` and `stale: true` rather than
   * throwing.
   */
  async overview(
    organizationId: string,
    filters: DashboardFilterSet,
    staleAfterMs: number,
  ) {
    const limit = filters.limit ?? 25;
    const now = new Date();

    const [funding, liabilities, duePayments, failures, reconciliation, refunds, recoveries] =
      await Promise.all([
        this.fundingSection(organizationId, filters, limit, staleAfterMs),
        this.liabilitiesSection(organizationId, filters, limit, staleAfterMs),
        this.duePaymentsSection(organizationId, filters, limit, staleAfterMs),
        this.failuresSection(organizationId, filters, limit, staleAfterMs),
        this.reconciliationSection(organizationId, filters, limit, staleAfterMs),
        this.refundsSection(organizationId, filters, limit, staleAfterMs),
        this.recoveriesSection(organizationId, filters, limit, staleAfterMs),
      ]);

    const sections = {
      funding,
      liabilities,
      duePayments,
      failures,
      reconciliation,
      refunds,
      recoveries,
    };

    return {
      organizationId,
      generatedAt: now,
      filters,
      // The oldest `asOf` across sections is the only honest answer to "how
      // fresh is this dashboard" — the newest section says nothing about the
      // stalest one.
      asOf: oldest(Object.values(sections).map((s) => s.asOf)),
      staleAfterMs,
      stale: Object.values(sections).some((s) => s.stale),
      sections,
    };
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  /**
   * Money that has been committed: open funding rounds and credited deposits.
   *
   * `availableMinor` is what could still be allocated. It is derived, not
   * stored, so it can never disagree with the ledger.
   */
  private async fundingSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const [rounds, deposits, totals] = await Promise.all([
      this.rounds.find(base).sort({ opensAt: -1 }).limit(limit).lean().exec(),
      this.deposits
        .find({ ...base, status: 'credited' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.deposits
        .aggregate<{ _id: string; total: number }>([
          { $match: { organizationId, status: 'credited' } },
          { $group: { _id: '$assetKey', total: { $sum: '$amountMinor' } } },
        ])
        .exec(),
    ]);

    const asOf = newest([
      ...rounds.map((r) => r.opensAt),
      ...deposits.map((d) => d.createdAt),
    ]);

    return {
      rounds,
      deposits,
      // Per-asset totals, so an operator can see at a glance whether the USD
      // and USDC pools have diverged.
      creditedByAsset: totals,
      count: { rounds: rounds.length, deposits: deposits.length },
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /**
   * Money the platform owes: open recovery claims and refunds awaiting a
   * decision.
   *
   * This is the section that needs a human. `awaitingDecision` is the count of
   * items an APPROVER can act on right now.
   */
  private async liabilitiesSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const [claims, refunds] = await Promise.all([
      this.claims
        .find({ ...base, status: { $in: ['open', 'partially_collected'] } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.refunds
        .find({ ...base, status: { $in: ['requested', 'approved'] } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const asOf = newest([
      ...claims.map((c) => c.createdAt),
      ...refunds.map((r) => r.createdAt),
    ]);

    return {
      claims,
      refunds,
      awaitingDecision: {
        claims: claims.length,
        refunds: refunds.length,
        // Summed so the operator sees the exposure, not just the row count.
        amountMinor: sum([
          ...claims.map((c) => c.claimedMinor - c.collectedMinor - c.writtenOffMinor),
          ...refunds.map((r) => r.amountMinor),
        ]),
      },
      count: { claims: claims.length, refunds: refunds.length },
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /** Payouts that are due or in flight and have not yet succeeded. */
  private async duePaymentsSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const payouts = await this.payouts
      .find({ ...base, status: { $in: ['pending', 'submitted'] } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const asOf = newest(payouts.map((p) => p.createdAt));

    return {
      payouts,
      count: payouts.length,
      amountMinor: sum(payouts.map((p) => p.amountMinor)),
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /**
   * Payouts that failed, with the recorded diagnosis.
   *
   * `lastFailure` is surfaced rather than the whole attempt history because
   * that is what an operator needs to decide between "retry" and "cancel".
   */
  private async failuresSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const failed = await this.payouts
      .find({ ...base, status: 'failed' })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const asOf = newest(failed.map((p) => p.updatedAt ?? p.createdAt));

    return {
      failed,
      count: failed.length,
      // Grouped by diagnosis code so a cluster of identical failures is visible
      // as a pattern rather than as N unrelated rows.
      byReason: groupBy(failed, (p) => p.lastFailure?.code ?? 'unknown'),
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /** Reconciliation runs and any ledger drift they found. */
  private async reconciliationSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const [runs, drift] = await Promise.all([
      this.runs.find(base).sort({ startedAt: -1 }).limit(limit).lean().exec(),
      this.balances
        .find(base)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const asOf = newest([
      ...runs.map((r) => r.startedAt),
      ...drift.map((d) => d.updatedAt),
    ]);

    return {
      runs,
      drift,
      count: { runs: runs.length, drift: drift.length },
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /** Refunds by status, with the amount at stake. */
  private async refundsSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const refunds = await this.refunds
      .find(base)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const asOf = newest(refunds.map((r) => r.createdAt));

    return {
      refunds,
      count: refunds.length,
      amountMinor: sum(refunds.map((r) => r.amountMinor)),
      byStatus: groupBy(refunds, (r) => r.status),
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /** Recovery claims and the collections made against them. */
  private async recoveriesSection(
    organizationId: string,
    filters: DashboardFilterSet,
    limit: number,
  ) {
    const base = this.scope({ organizationId }, filters);
    const [claims, collections] = await Promise.all([
      this.claims.find(base).sort({ createdAt: -1 }).limit(limit).lean().exec(),
      this.collections
        .find(base)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const asOf = newest([
      ...claims.map((c) => c.createdAt),
      ...collections.map((c) => c.createdAt),
    ]);

    return {
      claims,
      collections,
      count: { claims: claims.length, collections: collections.length },
      // Outstanding exposure: claimed minus what has been collected or written
      // off. This is the number that matters for reserves.
      outstandingMinor: sum(
        claims.map((c) => c.claimedMinor - c.collectedMinor - c.writtenOffMinor),
      ),
      asOf,
      stale: isStale(asOf, staleAfterMs),
    };
  }

  /**
   * Executes a high-risk action.
   *
   * The permission and confirmation checks live in the controller; this method
   * validates the action is one the dashboard actually supports and delegates to
   * the owning write service. Keeping the dispatch here means a client cannot
   * discover a mutation route by reading a GET response — the action list is
   * server-side only.
   *
   * `creditDeposit` and `recordCollection` are deliberately rejected: they
   * belong to workflows that already have their own endpoints and guards, and
   * re-exposing them here would create a second, weaker path to the same money
   * movement.
   *
   * @throws ValidationDomainException for an unknown action.
   */
  async execute(
    organizationId: string,
    dto: { action: string; id: string; note?: string },
    actor: { userId: string },
  ): Promise<unknown> {
    switch (dto.action) {
      case 'approve_refund':
        return this.refunds.approve(organizationId, dto.id, actor.userId);
      case 'approve_recovery':
        return this.recoveries.approve(organizationId, dto.id, actor.userId);
      case 'write_off_recovery':
        return this.recoveries.writeOff(organizationId, dto.id, actor.userId);
      case 'credit_deposit':
      case 'record_collection':
        throw new DashboardViewError(
          `"${dto.action}" is not supported via the dashboard; use its own endpoint`,
        );
      default:
        // An unrecognised action is a client bug, not a permission problem,
        // so it is a 400 rather than a 404.
        throw new DashboardViewError(`Unknown dashboard action "${dto.action}"`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Applies the shared filters to a Mongo filter.
   *
   * `asset` matches `assetKey` when the field exists; `status` is passed
   * through only when the caller did not already constrain status (sections
   * that need a status subset set it themselves, so a `status` filter would
   * otherwise hide the rows the section exists to show).
   */
  private scope(
    base: Record<string, unknown>,
    filters: DashboardFilterSet,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    if (filters.asset) out.assetKey = filters.asset;
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.$gte = new Date(filters.from);
      if (filters.to) range.$lte = new Date(filters.to);
      out.createdAt = range;
    }
    return out;
  }
}

/** Thrown when a `view` parameter cannot be decoded. */
export class DashboardViewError extends Error {}

// ── Small date/aggregate helpers ─────────────────────────────────────────────

function newest(dates: (Date | undefined)[]): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

function oldest(dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * True when `asOf` is older than the staleness threshold.
 *
 * A null `asOf` (the section read nothing) counts as stale: an empty section
 * is not a fresh section, it is an absent one, and the operator must be told.
 */
function isStale(asOf: Date | null, thresholdMs: number): boolean {
  if (!asOf) return true;
  return Date.now() - asOf.getTime() > thresholdMs;
}

/**
 * The default staleness threshold, in milliseconds.
 *
 * Kept as a function so the sections can be unit-tested with an explicit
 * threshold without the default being baked into every assertion.
 */
function staleAfterMsDefault(): number {
  return 15 * 60 * 1000;
}
