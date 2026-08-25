export function normalizeToUtcMidnight(dateInput: string | Date): Date {
  const d = new Date(dateInput);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Deadline = start + windowDays, then pushed forward one day at a time past
 * any registered closure date so a pickup window never expires on a day the
 * borrower couldn't have picked the item up.
 */
export function computePickupDeadline(
  start: Date,
  windowDays: number,
  closureDates: Set<string>,
): Date {
  let deadline = addDays(normalizeToUtcMidnight(start), windowDays);
  while (closureDates.has(deadline.toISOString().slice(0, 10))) {
    deadline = addDays(deadline, 1);
  }
  return deadline;
}
