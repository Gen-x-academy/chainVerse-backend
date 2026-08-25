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

  /** Fired after a library item is checked out and a receipt is created. */
  LIBRARY_CHECKOUT_RECEIPT_CREATED: 'library.checkout.receipt_created',

  /** Fired after a library item is returned and a receipt is created. */
  LIBRARY_RETURN_RECEIPT_CREATED: 'library.return.receipt_created',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
