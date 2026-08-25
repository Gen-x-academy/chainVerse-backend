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

  /** Fired when a student completes a course. */
  COURSE_COMPLETED: 'course.completed',

  /** Fired when a student passes a quiz. */
  QUIZ_PASSED: 'quiz.passed',

  /** Fired when learning hours are logged for a student. */
  HOURS_LOGGED: 'hours.logged',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
