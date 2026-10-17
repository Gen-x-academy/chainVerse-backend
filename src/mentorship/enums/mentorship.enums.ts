/**
 * Lifecycle of a mentorship application.
 *
 * `accepted`, `rejected` and `withdrawn` are terminal for review purposes;
 * `accepted` can still move to `withdrawn` while the program's withdrawal
 * cutoff has not passed.
 */
export enum ApplicationStatus {
  SUBMITTED = 'submitted',
  INFORMATION_REQUESTED = 'information_requested',
  WAITLISTED = 'waitlisted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

/** Structured decisions that can be recorded against an application. */
export enum DecisionType {
  ACCEPT = 'accept',
  REJECT = 'reject',
  WAITLIST = 'waitlist',
  REQUEST_INFORMATION = 'request_information',
  WITHDRAW = 'withdraw',
}

/**
 * Reason codes the applicant is allowed to see. Kept deliberately coarse so
 * that nothing about internal scoring or other applicants leaks through.
 */
export enum ApplicantReasonCode {
  STRONG_FIT = 'strong_fit',
  CAPACITY_REACHED = 'capacity_reached',
  ELIGIBILITY_NOT_MET = 'eligibility_not_met',
  INCOMPLETE_APPLICATION = 'incomplete_application',
  SKILL_LEVEL_MISMATCH = 'skill_level_mismatch',
  SCHEDULE_CONFLICT = 'schedule_conflict',
  ADDITIONAL_INFORMATION_NEEDED = 'additional_information_needed',
  APPLICANT_REQUESTED = 'applicant_requested',
  PROGRAM_CHANGED = 'program_changed',
  OTHER = 'other',
}

/** Reason codes for reviewers and staff only. Never returned to applicants. */
export enum InternalReasonCode {
  SCORING_THRESHOLD = 'scoring_threshold',
  MENTOR_PREFERENCE = 'mentor_preference',
  CONFLICT_OF_INTEREST = 'conflict_of_interest',
  POLICY_VIOLATION = 'policy_violation',
  DUPLICATE_APPLICATION = 'duplicate_application',
  CAPACITY_MANAGEMENT = 'capacity_management',
  APPLICANT_REQUEST = 'applicant_request',
  OTHER = 'other',
}

/** How (and when) the applicant is told about a decision. */
export enum CommunicationPolicy {
  /** Notify as soon as the decision is recorded. */
  NOTIFY_IMMEDIATELY = 'notify_immediately',
  /** Hold the notification until `effectiveAt`. */
  NOTIFY_AT_EFFECTIVE_TIME = 'notify_at_effective_time',
  /** Record only; the applicant still sees the outcome once effective. */
  SILENT = 'silent',
}

/** Whether, and after what, an applicant may apply again to the same program. */
export enum ReapplicationMode {
  NOT_ALLOWED = 'not_allowed',
  AFTER_WITHDRAWAL = 'after_withdrawal',
  AFTER_ANY_CLOSURE = 'after_any_closure',
}

/** Who caused a decision to be recorded. */
export enum DecisionActorKind {
  APPLICANT = 'applicant',
  REVIEWER = 'reviewer',
  STAFF = 'staff',
}

/** Lifecycle of the seat held for an accepted application. */
export enum ReservationStatus {
  NONE = 'none',
  HELD = 'held',
  RELEASED = 'released',
}

/** Outbox state for decision notifications dispatched by the background job. */
export enum NotificationDispatchStatus {
  PENDING = 'pending',
  DISPATCHING = 'dispatching',
  SENT = 'sent',
  FAILED = 'failed',
}
