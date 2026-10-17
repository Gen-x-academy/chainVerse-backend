/**
 * Service Level Objectives (SLOs) for the mentorship domain.
 *
 * Targets are expressed as error budgets over a rolling 30-day window.
 * Burn-rate alerting rules follow the multi-window, multi-burn-rate model
 * described in the SRE workbook so that fast-burning outages page while
 * slow-burning budget erosion only opens tickets.
 *
 * High-cardinality personal fields (user ids, proposal ids, free text) are
 * never used as metric labels; only low-cardinality dimensions such as
 * `event`, `outcome`, and `phase` are allowed.
 */

export interface SloIndicator {
  /** Stable metric name, e.g. `mentorship_match_acceptance_latency_ms`. */
  metric: string;
  /** Human-readable objective, e.g. "99% of match acceptances under 2s". */
  description: string;
  /** Threshold value compared against each observation. */
  threshold: number;
  /** Whether lower observed values are better (`true`) or higher (`false`). */
  lowerIsBetter: boolean;
  /** Error budget: the tolerated fraction of observations that may breach `threshold` in 30 days. */
  budgetRatio: number;
  /** Owning team, used for alert routing. */
  owner: string;
}

export interface BurnRateAlert {
  /** Short-burn multi-window rule: pages when the error budget is burning too fast. */
  shortWindow: { minutes: number; burnRate: number };
  /** Long-burn multi-window rule: pages when erosion is sustained over hours. */
  longWindow: { hours: number; burnRate: number };
}

/**
 * Canonical mentorship SLOs. Each maps to a low-cardinality metric emitted
 * via `MentorshipTelemetry` / `MetricsService`.
 */
export const MENTORSHIP_SLOS: SloIndicator[] = [
  {
    metric: 'mentorship_match_acceptance_latency_ms',
    description: 'Match acceptance completes within 2s at p99',
    threshold: 2000,
    lowerIsBetter: true,
    budgetRatio: 0.01,
    owner: 'mentorship',
  },
  {
    metric: 'mentorship_availability',
    description: 'Mentorship API availability >= 99.9%',
    threshold: 99.9,
    lowerIsBetter: false,
    budgetRatio: 0.001,
    owner: 'mentorship',
  },
  {
    metric: 'mentorship_session_completion_rate',
    description: '>= 95% of scheduled sessions complete without cancellation error',
    threshold: 95,
    lowerIsBetter: false,
    budgetRatio: 0.05,
    owner: 'mentorship',
  },
  {
    metric: 'mentorship_settlement_success_rate',
    description: '>= 99% of funded engagements settle successfully',
    threshold: 99,
    lowerIsBetter: false,
    budgetRatio: 0.01,
    owner: 'mentorship',
  },
];

/**
 * Default burn-rate alert rules for mentorship SLOs.
 *
 * Short window (1h): 14.4x burn rate pages (fast outage).
 * Long window (6h): 6x burn rate pages (sustained erosion).
 */
export const MENTORSHIP_BURN_RATE_ALERT: BurnRateAlert = {
  shortWindow: { minutes: 60, burnRate: 14.4 },
  longWindow: { hours: 6, burnRate: 6 },
};

/**
 * Computes the remaining error-budget ratio for an indicator given observed
 * breach counts over the current window.
 *
 * @param indicator the SLO indicator definition
 * @param totalObservations total number of recorded observations in window
 * @param breachObservations number of observations that breached `threshold`
 * @returns remaining budget as a ratio in [0, 1], or 1 if fully intact
 */
export function computeErrorBudget(
  indicator: SloIndicator,
  totalObservations: number,
  breachObservations: number,
): number {
  if (totalObservations === 0) return 1;
  const allowedBreaches = totalObservations * indicator.budgetRatio;
  const consumed = Math.max(0, breachObservations - allowedBreaches);
  const remaining = 1 - consumed / totalObservations;
  return remaining < 1e-9 ? 0 : remaining;
}

/**
 * Evaluates whether the current burn rate violates a page-level alert rule.
 */
export function shouldPage(
  burnRate: number,
  alert: BurnRateAlert = MENTORSHIP_BURN_RATE_ALERT,
): boolean {
  return (
    burnRate >= alert.shortWindow.burnRate || burnRate >= alert.longWindow.burnRate
  );
}
