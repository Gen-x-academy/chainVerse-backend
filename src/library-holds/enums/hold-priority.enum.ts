export enum HoldPriority {
  NORMAL = 'normal',
  HIGH = 'high',
}

/**
 * Documented priority policy (#1026): tutors default to HIGH priority when
 * placing a hold; students default to NORMAL. Staff may override a queued
 * hold's priority via the priority-change endpoint (reason required, logged
 * to the audit trail). Rank is the sort key used to break queue ties —
 * higher rank is served first; equal rank falls back to insertion order.
 */
export const HOLD_PRIORITY_RANK: Record<HoldPriority, number> = {
  [HoldPriority.NORMAL]: 0,
  [HoldPriority.HIGH]: 10,
};
