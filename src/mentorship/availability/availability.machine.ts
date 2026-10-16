/**
 * Pure availability rules for mentors (MENTOR-013).
 *
 * Kept free of Nest/Mongoose so the behaviour that discovery and applications
 * depend on can be tested without a database.
 */
export enum MentorAvailabilityStatus {
  ACCEPTING = 'accepting',
  LIMITED = 'limited',
  WAITLIST_ONLY = 'waitlist_only',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
  INACTIVE = 'inactive',
}

export interface AvailabilityEntry {
  status: MentorAvailabilityStatus;
  effectiveFrom: Date;
  maxActiveMentees?: number | null;
  /** Tie-breaker when two entries share an `effectiveFrom` (later wins). */
  sequence?: number;
}

/** Status a mentor has when no entry is in effect yet. */
export const DEFAULT_AVAILABILITY_STATUS = MentorAvailabilityStatus.INACTIVE;

const byPrecedenceDesc = (a: AvailabilityEntry, b: AvailabilityEntry): number =>
  b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
  (b.sequence ?? 0) - (a.sequence ?? 0);

/** The entry in force at `now`, or `undefined` if none has started. */
export function resolveCurrentEntry<T extends AvailabilityEntry>(
  entries: readonly T[],
  now: Date,
): T | undefined {
  return [...entries]
    .filter((e) => e.effectiveFrom.getTime() <= now.getTime())
    .sort(byPrecedenceDesc)[0];
}

/** Entries that start after `now`, soonest first. */
export function resolveUpcomingEntries<T extends AvailabilityEntry>(
  entries: readonly T[],
  now: Date,
): T[] {
  return entries
    .filter((e) => e.effectiveFrom.getTime() > now.getTime())
    .sort((a, b) => -byPrecedenceDesc(a, b));
}

/** Mentors in these states appear in discovery results. */
export function isDiscoverable(status: MentorAvailabilityStatus): boolean {
  return (
    status === MentorAvailabilityStatus.ACCEPTING ||
    status === MentorAvailabilityStatus.LIMITED ||
    status === MentorAvailabilityStatus.WAITLIST_ONLY
  );
}

/**
 * How a new application is treated in a given state.
 * `waitlist` means it is accepted but queued rather than offered a slot.
 */
export type ApplicationDisposition = 'open' | 'waitlist' | 'closed';

export function applicationDisposition(
  status: MentorAvailabilityStatus,
  activeMentees = 0,
  maxActiveMentees?: number | null,
): ApplicationDisposition {
  switch (status) {
    case MentorAvailabilityStatus.ACCEPTING:
      return 'open';
    case MentorAvailabilityStatus.LIMITED:
      return maxActiveMentees != null && activeMentees >= maxActiveMentees
        ? 'waitlist'
        : 'open';
    case MentorAvailabilityStatus.WAITLIST_ONLY:
      return 'waitlist';
    default:
      return 'closed';
  }
}
