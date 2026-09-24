// Minor-currency-unit thresholds above which a waiver/adjustment needs a
// second-party approval instead of being applied immediately.
export const MODERATOR_AUTO_APPROVE_LIMIT_MINOR_UNITS = parseInt(
  process.env.E_LIBRARY_MODERATOR_WAIVER_AUTO_LIMIT ?? '2000',
  10,
);
export const ADMIN_AUTO_APPROVE_LIMIT_MINOR_UNITS = parseInt(
  process.env.E_LIBRARY_ADMIN_WAIVER_AUTO_LIMIT ?? '20000',
  10,
);

// Overdue scheduler bounds, so a single run is always bounded and finite.
export const OVERDUE_JOB_BATCH_SIZE = parseInt(
  process.env.E_LIBRARY_OVERDUE_JOB_BATCH_SIZE ?? '500',
  10,
);
export const OVERDUE_JOB_MAX_BATCHES = parseInt(
  process.env.E_LIBRARY_OVERDUE_JOB_MAX_BATCHES ?? '20',
  10,
);

// Currency used to price the overdue fine posted automatically when a loan
// transitions to overdue. A library operating in multiple currencies should
// override this per deployment; charges/payments elsewhere in the module
// always take an explicit currency from the caller.
export const DEFAULT_CURRENCY = process.env.E_LIBRARY_DEFAULT_CURRENCY ?? 'USD';

// ── Borrowing suspension thresholds (Issue #1039) ────────────────────────────

// Number of concurrently OVERDUE loans that triggers automatic suspension.
export const SUSPENSION_OVERDUE_COUNT_THRESHOLD = parseInt(
  process.env.E_LIBRARY_SUSPENSION_OVERDUE_COUNT ?? '3',
  10,
);

// Oldest overdue loan age in days that triggers automatic suspension.
export const SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD = parseInt(
  process.env.E_LIBRARY_SUSPENSION_OVERDUE_AGE_DAYS ?? '30',
  10,
);

// Outstanding unpaid balance in minor currency units that triggers automatic
// suspension. Evaluated in E_LIBRARY_DEFAULT_CURRENCY.
export const SUSPENSION_UNPAID_BALANCE_THRESHOLD = parseInt(
  process.env.E_LIBRARY_SUSPENSION_UNPAID_BALANCE ?? '5000',
  10,
);
