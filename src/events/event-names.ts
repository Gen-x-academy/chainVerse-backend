/**
 * Typed constants for every domain event published in the system.
 * Always use these constants (never raw strings) when emitting or listening
 * so that a rename is caught at compile time.
 */
export const DomainEvents = {
  /** Fired after a student account is successfully created. */
  STUDENT_REGISTERED: 'student.registered',

  /** Fired after a student is enrolled in a course. */
  STUDENT_ENROLLED: 'student.enrolled',

  /** Fired after an admin/moderator approves a financial-aid application. */
  FINANCIAL_AID_APPROVED: 'financial-aid.approved',

  /** Fired after a certificate (NFT achievement) is issued to a student. */
  CERTIFICATE_ISSUED: 'certificate.issued',

  /** Fired after a sponsor deposit is credited to a scholarship fund. */
  SCHOLARSHIP_DEPOSIT_CREDITED: 'scholarship-finance.deposit.credited',

  /** Fired after a refund / returned payment is completed. */
  SCHOLARSHIP_REFUND_COMPLETED: 'scholarship-finance.refund.completed',

  /**
   * Fired when a recovery claim is approved. Listeners must deliver the
   * recovery notice to the recipient — collection is never automatic.
   */
  SCHOLARSHIP_RECOVERY_OPENED: 'scholarship-finance.recovery.opened',

  /** Fired by the integrity job when ledger balances or recoveries drift. */
  SCHOLARSHIP_LEDGER_DRIFT_DETECTED: 'scholarship-finance.ledger.drift-detected',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
