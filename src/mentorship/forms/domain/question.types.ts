/**
 * Typed question model for configurable mentorship application forms (MENTOR-032).
 *
 * A form version is an ordered list of questions. Published versions are
 * immutable snapshots; applications reference the version they were filled
 * against, so historical responses always render with the exact questions,
 * labels and options the applicant saw.
 */
export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'number',
  'boolean',
  'date',
  'url',
  'email',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set(['single_choice', 'multi_choice']);
export const TEXT_TYPES: ReadonlySet<QuestionType> = new Set(['short_text', 'long_text', 'url', 'email']);

export const CONDITION_OPERATORS = ['equals', 'not_equals', 'in', 'answered', 'not_answered'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export type ScalarAnswer = string | number | boolean;
export type AnswerValue = ScalarAnswer | string[];

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

/**
 * Show this question only when the referenced *earlier* question matches.
 * Restricting references to earlier questions makes the visibility graph a
 * DAG evaluated in a single ordered pass – no cycles, same result every time.
 */
export interface VisibilityCondition {
  questionKey: string;
  operator: ConditionOperator;
  value?: ScalarAnswer | ScalarAnswer[];
}

export interface QuestionDefinition {
  key: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  required: boolean;
  order: number;
  validation?: QuestionValidation;
  options?: QuestionOption[];
  visibleWhen?: VisibilityCondition;
}

export const FORM_LIMITS = {
  maxQuestions: 100,
  maxOptions: 50,
  labelMax: 300,
  helpTextMax: 1000,
  shortTextDefaultMax: 500,
  longTextDefaultMax: 5000,
  hardTextMax: 10000,
} as const;
