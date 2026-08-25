/**
 * Typed constants for every e-library domain event published in the system.
 * Always use these constants (never raw strings) when emitting or listening
 * so that a rename is caught at compile time.
 *
 * Each event carries a stable string ID and a versioned payload class.
 * Events contain no secrets and are safe for idempotent consumers and replay.
 */
export const LibraryEvents = {
  // ── Circulation ────────────────────────────────────────────────────────
  /** Fired when a patron checks out a physical or digital item. */
  ITEM_CHECKED_OUT: 'library.item.checked-out',

  /** Fired when a patron returns a physical or digital item. */
  ITEM_RETURNED: 'library.item.returned',

  // ── Due-soon / Overdue ──────────────────────────────────────────────────
  /** Fired by the scheduler when an item is approaching its due date. */
  ITEM_DUE_SOON: 'library.item.due-soon',

  /** Fired by the scheduler when an item becomes overdue. */
  ITEM_OVERDUE: 'library.item.overdue',

  // ── Renewals ─────────────────────────────────────────────────────────
  /** Fired when a loan is successfully renewed. */
  LOAN_RENEWED: 'library.loan.renewed',

  // ── Holds ────────────────────────────────────────────────────────────
  /** Fired when a held item becomes available for pickup. */
  HOLD_READY: 'library.hold.ready',

  /** Fired when a hold expires without being collected. */
  HOLD_EXPIRED: 'library.hold.expired',

  // ── Charges ──────────────────────────────────────────────────────────
  /** Fired when a fine or charge is applied to a patron account. */
  CHARGE_APPLIED: 'library.charge.applied',

  /** Fired when a patron makes a payment against a charge. */
  PAYMENT_RECEIVED: 'library.payment.received',

  // ── Digital licences ─────────────────────────────────────────────────
  /** Fired when a digital content licence is about to expire. */
  LICENSE_EXPIRING: 'library.license.expiring',
} as const;

export type LibraryEventName = (typeof LibraryEvents)[keyof typeof LibraryEvents];