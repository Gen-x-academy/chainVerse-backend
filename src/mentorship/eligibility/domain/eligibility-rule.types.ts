import { AnswerValue, ScalarAnswer } from '../../forms/domain/question.types';

/**
 * Eligibility rules for mentorship programs (MENTOR-033).
 *
 * Rules are data, versioned per program in immutable rule sets. The same
 * pure evaluator runs for preflight and for submission, so a preflight
 * `pass` against rule-set version N is exactly what submission enforces
 * against version N.
 */
export const RULE_TYPES = [
  'min_completed_courses',
  'completed_course',
  'max_active_applications',
  'answer_in',
  'answer_number_range',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export type RuleParams =
  | { type: 'min_completed_courses'; count: number }
  | { type: 'completed_course'; courseIds: string[]; match: 'any' | 'all' }
  | { type: 'max_active_applications'; max: number }
  | { type: 'answer_in'; questionKey: string; values: ScalarAnswer[] }
  | { type: 'answer_number_range'; questionKey: string; min?: number; max?: number };

export interface EligibilityRule {
  /** Opaque, stable id shown to applicants (never reveals the rule logic). */
  id: string;
  type: RuleType;
  params: Record<string, unknown>;
  /** Plain-text explanation shown when the rule is not met. */
  publicMessage: string;
  /** https URL or same-origin path where the applicant can fix the issue. */
  remediationUrl?: string;
  /**
   * Sensitive rules (e.g. invitation-only course lists) are evaluated but
   * reported with a generic message, no type and no remediation detail.
   */
  sensitive: boolean;
}

export type CheckOutcome = 'pass' | 'fail' | 'needs_information';
export type EligibilityOutcome = CheckOutcome;

/** Built-in rule that is always evaluated first, independent of rule sets. */
export const WINDOW_RULE_ID = 'application_window';

/** Server-derived facts. Never accepted from the client. */
export interface ApplicantFacts {
  now: Date;
  programStatus: string;
  applicationOpensAt: Date | null;
  applicationClosesAt: Date | null;
  completedCourseIds: string[];
  /** Open applications in *other* programs. */
  activeApplicationCount: number;
  /** Normalised answers for visible questions of the current form. */
  answers: Record<string, AnswerValue>;
  /** Keys of questions the current form defines (to tell "unanswered" from "not asked"). */
  formQuestionKeys: string[];
}

/** Applicant-safe result for one rule. */
export interface PublicCheck {
  ruleId: string;
  outcome: CheckOutcome;
  /** Omitted for sensitive rules. */
  type?: RuleType | typeof WINDOW_RULE_ID;
  message?: string;
  remediationUrl?: string;
  /** For needs_information: the question key the applicant should answer. */
  questionKey?: string;
}

export interface EligibilityResult {
  outcome: EligibilityOutcome;
  checks: PublicCheck[];
}
