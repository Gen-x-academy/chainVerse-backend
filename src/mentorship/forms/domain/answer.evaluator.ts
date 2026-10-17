import {
  AnswerValue,
  CHOICE_TYPES,
  FORM_LIMITS,
  QuestionDefinition,
  ScalarAnswer,
  VisibilityCondition,
} from './question.types';
import { sortQuestions } from './form-definition.validator';

export type AnswerIssueCode =
  | 'unknown_question'
  | 'required'
  | 'invalid_type'
  | 'invalid_option'
  | 'too_short'
  | 'too_long'
  | 'out_of_range'
  | 'invalid_format';

export interface AnswerIssue {
  field: string;
  code: AnswerIssueCode;
  issue: string;
}

export interface AnswerEvaluation {
  /** Normalised answers for visible questions only. */
  answers: Record<string, AnswerValue>;
  visibleKeys: string[];
  /** Keys that were supplied for questions hidden by conditions (dropped). */
  hiddenKeysDropped: string[];
  /** Keys that do not exist in this form version (stale client). */
  unknownKeys: string[];
  /** Required visible questions without an answer. */
  missingRequired: string[];
  issues: AnswerIssue[];
}

export interface EvaluateOptions {
  /** Partial mode (preflight / drafts): missing required answers are not issues. */
  partial?: boolean;
}

/**
 * Deterministically evaluates answers against a form version.
 *
 * Questions are walked once in canonical order. A question is visible when
 * it has no condition, or its condition holds against the *normalised answer
 * of an earlier visible question* (hidden questions count as unanswered).
 * Because conditions only reference earlier questions, the result depends
 * only on (questions, answers) – never on input key order.
 */
export function evaluateAnswers(
  questions: QuestionDefinition[],
  rawAnswers: Record<string, unknown>,
  options: EvaluateOptions = {},
): AnswerEvaluation {
  const ordered = sortQuestions(questions);
  const known = new Set(ordered.map((q) => q.key));
  const answers: Record<string, AnswerValue> = {};
  const visibleKeys: string[] = [];
  const hiddenKeysDropped: string[] = [];
  const missingRequired: string[] = [];
  const issues: AnswerIssue[] = [];

  const unknownKeys = Object.keys(rawAnswers).filter((k) => !known.has(k)).sort();
  for (const key of unknownKeys) {
    issues.push({ field: `answers.${key}`, code: 'unknown_question', issue: 'not a question in this form version' });
  }

  for (const q of ordered) {
    const raw = rawAnswers[q.key];
    const provided = isProvided(raw);

    if (q.visibleWhen && !conditionHolds(q.visibleWhen, answers)) {
      if (provided) hiddenKeysDropped.push(q.key);
      continue;
    }
    visibleKeys.push(q.key);

    if (!provided) {
      if (q.required) {
        missingRequired.push(q.key);
        if (!options.partial) {
          issues.push({ field: `answers.${q.key}`, code: 'required', issue: 'an answer is required' });
        }
      }
      continue;
    }

    const result = normaliseAnswer(q, raw);
    if ('issue' in result) {
      issues.push({ field: `answers.${q.key}`, code: result.code, issue: result.issue });
    } else {
      answers[q.key] = result.value;
    }
  }

  return { answers, visibleKeys, hiddenKeysDropped, unknownKeys, missingRequired, issues };
}

export function conditionHolds(cond: VisibilityCondition, answers: Record<string, AnswerValue>): boolean {
  const current = answers[cond.questionKey];
  const answered = current !== undefined;
  switch (cond.operator) {
    case 'answered':
      return answered;
    case 'not_answered':
      return !answered;
    case 'equals':
      return answered && matches(current, cond.value as ScalarAnswer);
    case 'not_equals':
      return !answered || !matches(current, cond.value as ScalarAnswer);
    case 'in':
      return answered && (cond.value as ScalarAnswer[]).some((v) => matches(current, v));
    default:
      return false;
  }
}

/** multi_choice answers match when they contain the value. */
function matches(answer: AnswerValue, value: ScalarAnswer): boolean {
  return Array.isArray(answer) ? answer.includes(value as string) : answer === value;
}

function isProvided(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  if (Array.isArray(raw) && raw.length === 0) return false;
  return true;
}

type Normalised = { value: AnswerValue } | { code: AnswerIssueCode; issue: string };

function normaliseAnswer(q: QuestionDefinition, raw: unknown): Normalised {
  const v = q.validation ?? {};

  switch (q.type) {
    case 'short_text':
    case 'long_text':
    case 'url':
    case 'email': {
      if (typeof raw !== 'string') return { code: 'invalid_type', issue: 'must be a string' };
      // eslint-disable-next-line no-control-regex
      const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      const max = Math.min(
        v.maxLength ?? (q.type === 'long_text' ? FORM_LIMITS.longTextDefaultMax : FORM_LIMITS.shortTextDefaultMax),
        FORM_LIMITS.hardTextMax,
      );
      if (v.minLength !== undefined && text.length < v.minLength) {
        return { code: 'too_short', issue: `must be at least ${v.minLength} characters` };
      }
      if (text.length > max) return { code: 'too_long', issue: `must be at most ${max} characters` };
      if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return { code: 'invalid_format', issue: 'must be a valid email address' };
      }
      if (q.type === 'url') {
        try {
          const url = new URL(text);
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        } catch {
          return { code: 'invalid_format', issue: 'must be an http(s) URL' };
        }
      }
      return { value: text };
    }

    case 'number': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { code: 'invalid_type', issue: 'must be a number' };
      if (v.integer && !Number.isInteger(n)) return { code: 'invalid_type', issue: 'must be a whole number' };
      if ((v.min !== undefined && n < v.min) || (v.max !== undefined && n > v.max)) {
        return { code: 'out_of_range', issue: `must be between ${v.min ?? '-∞'} and ${v.max ?? '∞'}` };
      }
      return { value: n };
    }

    case 'boolean':
      if (typeof raw !== 'boolean') return { code: 'invalid_type', issue: 'must be true or false' };
      return { value: raw };

    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
        return { code: 'invalid_format', issue: 'must be a date in YYYY-MM-DD format' };
      }
      return { value: raw };
    }

    case 'single_choice': {
      if (typeof raw !== 'string') return { code: 'invalid_type', issue: 'must be one option value' };
      if (!q.options?.some((o) => o.value === raw)) return { code: 'invalid_option', issue: 'is not a valid option' };
      return { value: raw };
    }

    case 'multi_choice': {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
        return { code: 'invalid_type', issue: 'must be an array of option values' };
      }
      const allowed = new Set(q.options?.map((o) => o.value));
      if (raw.some((x) => !allowed.has(x))) return { code: 'invalid_option', issue: 'contains an invalid option' };
      // Normalise to the option order so equal selections hash identically.
      const selected = q.options!.map((o) => o.value).filter((val) => raw.includes(val));
      if (v.minSelections !== undefined && selected.length < v.minSelections) {
        return { code: 'out_of_range', issue: `select at least ${v.minSelections}` };
      }
      if (v.maxSelections !== undefined && selected.length > v.maxSelections) {
        return { code: 'out_of_range', issue: `select at most ${v.maxSelections}` };
      }
      return { value: selected };
    }

    default:
      return { code: 'invalid_type', issue: 'unsupported question type' };
  }
}

/** Human-readable rendering of a stored answer against its form version. */
export function displayAnswer(q: QuestionDefinition, value: AnswerValue | undefined): string | null {
  if (value === undefined) return null;
  if (CHOICE_TYPES.has(q.type)) {
    const labels = new Map<string, string>((q.options ?? []).map((o) => [o.value, o.label] as [string, string]));
    const values = Array.isArray(value) ? value : [String(value)];
    return values.map((x) => labels.get(x) ?? x).join(', ');
  }
  if (q.type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
