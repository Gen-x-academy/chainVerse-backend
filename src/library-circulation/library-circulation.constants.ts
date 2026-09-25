/** Default circulation policy applied to every checkout. */
export const DEFAULT_LOAN_PERIOD_DAYS = 14;
export const DEFAULT_MAX_RENEWALS = 2;

/**
 * A due-date override that extends the due date by more than this many days
 * beyond the original due date exceeds normal staff authority and requires
 * elevated (admin) approval.
 */
export const MAX_STAFF_OVERRIDE_EXTENSION_DAYS = 30;

export const DEFAULT_POLICY_LABEL = `Standard ${DEFAULT_LOAN_PERIOD_DAYS}-day loan, max ${DEFAULT_MAX_RENEWALS} renewals`;
