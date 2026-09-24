/**
 * Enumerations shared by every layer of the scholarship domain.
 *
 * Amounts are always integer minor units (e.g. stroops, cents) so allocation
 * arithmetic is exact; percentages are basis points (10 000 = 100%).
 */

export const BASIS_POINTS_TOTAL = 10_000;

/** Milestone keys are stable identifiers that survive schedule amendments. */
export const MILESTONE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export enum ScholarshipAwardStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

export enum MilestoneType {
  ENROLLMENT = 'enrollment',
  ATTENDANCE = 'attendance',
  COURSEWORK = 'coursework',
  COMPLETION = 'completion',
  CUSTOM = 'custom',
}

export enum MilestoneScheduleStatus {
  /** Editable; not yet binding. */
  DRAFT = 'draft',
  /** Binding; immutable except through a governed amendment. */
  ACTIVE = 'active',
  /** A proposed replacement for the active schedule awaiting a second approver. */
  PENDING_AMENDMENT = 'pending_amendment',
  /** Replaced by an approved amendment. */
  SUPERSEDED = 'superseded',
  /** Amendment proposal that was declined. */
  REJECTED = 'rejected',
}

export enum MilestoneProgressStatus {
  PENDING = 'pending',
  EVIDENCE_SUBMITTED = 'evidence_submitted',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** Removed from the schedule by an approved amendment. */
  WITHDRAWN = 'withdrawn',
}

/** States in which new evidence may be submitted for a milestone. */
export const EVIDENCE_ACCEPTING_STATUSES: readonly MilestoneProgressStatus[] = [
  MilestoneProgressStatus.PENDING,
  MilestoneProgressStatus.EVIDENCE_SUBMITTED,
  MilestoneProgressStatus.CHANGES_REQUESTED,
];

/**
 * States that lock a milestone's definition: an amendment may not remove or
 * re-price a milestone that has evidence under review or has been decided.
 */
export const LOCKED_MILESTONE_STATUSES: readonly MilestoneProgressStatus[] = [
  MilestoneProgressStatus.EVIDENCE_SUBMITTED,
  MilestoneProgressStatus.APPROVED,
  MilestoneProgressStatus.REJECTED,
];

export enum EvidenceType {
  ENROLLMENT_CONFIRMATION = 'enrollment_confirmation',
  ATTENDANCE_RECORD = 'attendance_record',
  GRADE_REPORT = 'grade_report',
  COMPLETION_CERTIFICATE = 'completion_certificate',
  DOCUMENT_REFERENCE = 'document_reference',
  ATTESTATION = 'attestation',
  OTHER = 'other',
}

export enum EvidenceSubmitterType {
  /** The award recipient submitting on their own behalf. */
  RECIPIENT = 'recipient',
  /** A trusted integration (org owner/admin account or platform admin). */
  SYSTEM = 'system',
}

export enum VerificationDecisionType {
  APPROVE = 'approve',
  REJECT = 'reject',
  REQUEST_CHANGES = 'request_changes',
}

export enum VerificationReasonCode {
  // approve
  EVIDENCE_SUFFICIENT = 'EVIDENCE_SUFFICIENT',
  VERIFIED_WITH_ISSUER = 'VERIFIED_WITH_ISSUER',
  // reject
  EVIDENCE_INVALID = 'EVIDENCE_INVALID',
  MILESTONE_NOT_MET = 'MILESTONE_NOT_MET',
  DEADLINE_MISSED = 'DEADLINE_MISSED',
  FRAUD_SUSPECTED = 'FRAUD_SUSPECTED',
  RECIPIENT_INELIGIBLE = 'RECIPIENT_INELIGIBLE',
  // request changes
  MISSING_INFORMATION = 'MISSING_INFORMATION',
  ILLEGIBLE_OR_CORRUPT = 'ILLEGIBLE_OR_CORRUPT',
  WRONG_MILESTONE = 'WRONG_MILESTONE',
  NEEDS_ISSUER_CONFIRMATION = 'NEEDS_ISSUER_CONFIRMATION',
}

/** Which reason codes may accompany which decision. */
export const REASON_CODES_BY_DECISION: Record<
  VerificationDecisionType,
  readonly VerificationReasonCode[]
> = {
  [VerificationDecisionType.APPROVE]: [
    VerificationReasonCode.EVIDENCE_SUFFICIENT,
    VerificationReasonCode.VERIFIED_WITH_ISSUER,
  ],
  [VerificationDecisionType.REJECT]: [
    VerificationReasonCode.EVIDENCE_INVALID,
    VerificationReasonCode.MILESTONE_NOT_MET,
    VerificationReasonCode.DEADLINE_MISSED,
    VerificationReasonCode.FRAUD_SUSPECTED,
    VerificationReasonCode.RECIPIENT_INELIGIBLE,
  ],
  [VerificationDecisionType.REQUEST_CHANGES]: [
    VerificationReasonCode.MISSING_INFORMATION,
    VerificationReasonCode.ILLEGIBLE_OR_CORRUPT,
    VerificationReasonCode.WRONG_MILESTONE,
    VerificationReasonCode.NEEDS_ISSUER_CONFIRMATION,
  ],
};

export const PROGRESS_STATUS_BY_DECISION: Record<
  VerificationDecisionType,
  MilestoneProgressStatus
> = {
  [VerificationDecisionType.APPROVE]: MilestoneProgressStatus.APPROVED,
  [VerificationDecisionType.REJECT]: MilestoneProgressStatus.REJECTED,
  [VerificationDecisionType.REQUEST_CHANGES]:
    MilestoneProgressStatus.CHANGES_REQUESTED,
};

export enum VerifierAssignmentStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

export enum DisbursementIntentStatus {
  /** Created and stable; not yet handed to an external executor. */
  CREATED = 'created',
  /** Handed to the executor (e.g. a Stellar transaction was submitted). */
  SUBMITTED = 'submitted',
  /** Executor confirmed settlement. Terminal. */
  CONFIRMED = 'confirmed',
  /** Executor reported failure; the same intent may be resubmitted. */
  FAILED = 'failed',
  /** Withdrawn before settlement. Terminal. */
  CANCELLED = 'cancelled',
}

/** Allowed intent transitions. Anything not listed is rejected. */
export const INTENT_TRANSITIONS: Record<
  DisbursementIntentStatus,
  readonly DisbursementIntentStatus[]
> = {
  [DisbursementIntentStatus.CREATED]: [
    DisbursementIntentStatus.SUBMITTED,
    DisbursementIntentStatus.CANCELLED,
  ],
  [DisbursementIntentStatus.SUBMITTED]: [
    DisbursementIntentStatus.CONFIRMED,
    DisbursementIntentStatus.FAILED,
  ],
  [DisbursementIntentStatus.FAILED]: [
    DisbursementIntentStatus.SUBMITTED,
    DisbursementIntentStatus.CANCELLED,
  ],
  [DisbursementIntentStatus.CONFIRMED]: [],
  [DisbursementIntentStatus.CANCELLED]: [],
};
