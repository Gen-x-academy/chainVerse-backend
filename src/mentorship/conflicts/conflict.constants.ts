/** Categories evaluated before proposal and activation (MENTOR-040). */
export enum ConflictCategory {
  ORGANIZATION = 'organization',
  REPORTING = 'reporting',
  REVIEW = 'review',
  FINANCIAL = 'financial',
  DECLARED = 'declared',
}

export enum ConflictSeverity {
  HARD = 'hard',
  POTENTIAL = 'potential',
}

export enum CheckOutcome {
  CLEAR = 'clear',
  POTENTIAL = 'potential',
  HARD = 'hard',
}

export enum WaiverStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Version of the conflict rules used by the evaluator; bumped when rules change. */
export const CONFLICT_RULES_VERSION = 1;

/**
 * Client-safe explanations keyed by finding code. Private free text (declared
 * relationship notes, waiver reasons) is deliberately never included here.
 */
export const FINDING_MESSAGES: Record<string, string> = {
  ORG_SAME: 'The mentor and mentee belong to the same organization.',
  REPORTING_LINE: 'A direct reporting relationship exists between the participants.',
  REVIEW_RELATIONSHIP: 'The mentor is responsible for reviewing the mentee’s work.',
  FINANCIAL_RELATIONSHIP: 'A financial relationship exists between the participants.',
  DECLARED_HARD: 'A declared relationship must be reviewed before activation.',
  DECLARED_POTENTIAL: 'A declared relationship may influence the mentorship.',
};
