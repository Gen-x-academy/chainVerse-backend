/**
 * MENTOR-083 — pure, deterministic cancellation/refund calculation.
 *
 * Inputs are a *snapshotted* policy (copied onto the booking when it was made,
 * so later policy edits never change an existing booking), the session start
 * as an absolute instant, and the cancellation instant. Everything is integer
 * arithmetic on minor units, so the same inputs always give the same output.
 *
 * Time-zone safety: the boundaries are "N hours before the session starts",
 * measured between two UTC instants. That arithmetic does not depend on the
 * server's or the learner's zone and cannot be shifted by a daylight-saving
 * change. The session's IANA zone is used only to *describe* the boundary to
 * people (`describeBoundary`), never to compute it.
 */

export const BPS_DENOMINATOR = 10_000;

export interface RefundTier {
  /** The tier applies when the cancellation is at least this many hours before start. */
  minHoursBeforeStart: number;
  /** Share refunded to the learner, in basis points (0..10000). */
  refundBps: number;
}

export interface CancellationPolicySnapshot {
  version: string;
  /** IANA zone of the session, used only for human-readable boundaries. */
  timeZone: string;
  /** Tiers in any order; the tier with the largest matching threshold wins. */
  tiers: RefundTier[];
  /** Refund share when no tier matches (a late cancellation). */
  lateRefundBps: number;
}

export type CancelledBy = 'learner' | 'mentor' | 'system';

export interface RefundInput {
  /** Amount held in escrow, integer minor units. */
  heldAmountMinor: number;
  sessionStart: Date;
  cancelledAt: Date;
  cancelledBy: CancelledBy;
  policy: CancellationPolicySnapshot;
}

export interface RefundResult {
  refundMinor: number;
  /** What the mentor keeps (held minus refund). */
  retainedMinor: number;
  refundBps: number;
  /** Which rule decided the outcome, for audit and display. */
  rule: 'mentor_or_system_cancelled' | 'session_started' | 'tier' | 'late';
  matchedTierMinHours: number | null;
  hoursBeforeStart: number;
  /** The instant the next-better tier stops being available, when one exists. */
  nextBoundaryAt: Date | null;
}

const HOUR_MS = 3_600_000;

export function validatePolicy(policy: CancellationPolicySnapshot): string[] {
  const problems: string[] = [];
  const bpsOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= BPS_DENOMINATOR;
  if (!bpsOk(policy.lateRefundBps)) problems.push('lateRefundBps must be an integer in 0..10000');
  if (!policy.tiers.length) problems.push('at least one tier is required');
  const seen = new Set<number>();
  for (const tier of policy.tiers) {
    if (!bpsOk(tier.refundBps)) problems.push('tier refundBps must be an integer in 0..10000');
    if (!Number.isFinite(tier.minHoursBeforeStart) || tier.minHoursBeforeStart < 0) {
      problems.push('tier minHoursBeforeStart must be a non-negative number');
    }
    if (seen.has(tier.minHoursBeforeStart)) problems.push('tier thresholds must be unique');
    seen.add(tier.minHoursBeforeStart);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: policy.timeZone });
  } catch {
    problems.push('timeZone must be a valid IANA zone');
  }
  return problems;
}

/** `floor(amount * bps / 10000)` without overflowing 2^53 for realistic amounts. */
export function applyBps(amountMinor: number, bps: number): number {
  return Number((BigInt(amountMinor) * BigInt(bps)) / BigInt(BPS_DENOMINATOR));
}

export function calculateRefund(input: RefundInput): RefundResult {
  const { heldAmountMinor, sessionStart, cancelledAt, cancelledBy, policy } = input;
  if (!Number.isInteger(heldAmountMinor) || heldAmountMinor < 0) {
    throw new RangeError('heldAmountMinor must be a non-negative integer');
  }
  const problems = validatePolicy(policy);
  if (problems.length) throw new RangeError(`invalid policy: ${problems.join('; ')}`);

  const msBefore = sessionStart.getTime() - cancelledAt.getTime();
  const hoursBeforeStart = msBefore / HOUR_MS;

  const finish = (
    refundBps: number,
    rule: RefundResult['rule'],
    matchedTierMinHours: number | null,
  ): RefundResult => {
    const refundMinor = applyBps(heldAmountMinor, refundBps);
    return {
      refundMinor,
      retainedMinor: heldAmountMinor - refundMinor,
      refundBps,
      rule,
      matchedTierMinHours,
      hoursBeforeStart,
      nextBoundaryAt: nextBoundary(sessionStart, cancelledAt, policy, matchedTierMinHours),
    };
  };

  if (cancelledBy !== 'learner') return finish(BPS_DENOMINATOR, 'mentor_or_system_cancelled', null);
  if (msBefore <= 0) return finish(policy.lateRefundBps, 'session_started', null);

  // Largest threshold first; a cancellation exactly on the threshold qualifies.
  const tiers = [...policy.tiers].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);
  const matched = tiers.find((t) => hoursBeforeStart >= t.minHoursBeforeStart);
  return matched
    ? finish(matched.refundBps, 'tier', matched.minHoursBeforeStart)
    : finish(policy.lateRefundBps, 'late', null);
}

function nextBoundary(
  sessionStart: Date,
  cancelledAt: Date,
  policy: CancellationPolicySnapshot,
  matchedMinHours: number | null,
): Date | null {
  // The matched tier stays available until `matchedMinHours` before start.
  if (matchedMinHours === null) return null;
  const boundary = new Date(sessionStart.getTime() - matchedMinHours * HOUR_MS);
  return boundary.getTime() > cancelledAt.getTime() ? boundary : null;
}

/** Render an instant in the session's zone, e.g. for "free cancellation until ...". */
export function describeBoundary(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(instant);
}
