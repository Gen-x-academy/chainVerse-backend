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

  /** Fired when a student requests a verification email resend (distinct from initial registration). */
  VERIFICATION_EMAIL_RESENT: 'student.verification-email-resent',

  /** Fired after an admin/moderator approves a financial-aid application. */
  FINANCIAL_AID_APPROVED: 'financial-aid.approved',

  /** Fired after a certificate (NFT achievement) is issued to a student. */
  CERTIFICATE_ISSUED: 'certificate.issued',

  /** Fired after a structured decision is recorded on a mentorship application. */
  MENTORSHIP_APPLICATION_DECIDED: 'mentorship.application.decided',

  /** Fired after an applicant withdraws a mentorship application. */
  MENTORSHIP_APPLICATION_WITHDRAWN: 'mentorship.application.withdrawn',

  /** Fired after an applicant reapplies to a mentorship program. */
  MENTORSHIP_APPLICATION_REAPPLIED: 'mentorship.application.reapplied',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
