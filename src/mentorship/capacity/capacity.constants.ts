/** Scope at which a capacity policy applies (MENTOR-041). */
export enum CapacityScope {
  GLOBAL = 'global',
  PROGRAM = 'program',
  MENTOR = 'mentor',
}

/** Lifecycle of a proposal's capacity reservation. Rows are append-only in effect. */
export enum ReservationStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

/** Default and maximum lifetime of an unconfirmed reservation. */
export const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;
export const MAX_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Stable document key for a policy scope. */
export const scopeKeyFor = (scope: CapacityScope, targetId?: string): string =>
  scope === CapacityScope.GLOBAL ? 'global' : `${scope}:${targetId}`;
