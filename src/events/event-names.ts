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

  /** Fired after a mentorship application form version is published (MENTOR-032). */
  MENTORSHIP_FORM_PUBLISHED: 'mentorship.form.published',

  /** Fired after an eligibility rule-set version is published (MENTOR-033). */
  MENTORSHIP_RULESET_PUBLISHED: 'mentorship.ruleset.published',

  /** Fired after an applicant submits a mentorship application. */
  MENTORSHIP_APPLICATION_SUBMITTED: 'mentorship.application.submitted',

  /** Fired after an application is (re)assigned or unassigned in a review queue (MENTOR-034). */
  MENTORSHIP_REVIEW_ASSIGNED: 'mentorship.review.assigned',

  /** Fired after a reviewer records a decision on an application (MENTOR-034). */
  MENTORSHIP_REVIEW_DECIDED: 'mentorship.review.decided',

  /** Fired by the review sweeper when an application passes its review due date. */
  MENTORSHIP_REVIEW_OVERDUE: 'mentorship.review.overdue',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
