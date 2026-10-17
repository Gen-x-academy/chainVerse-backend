import * as Joi from 'joi';
import { createHash } from 'crypto';
import { findUnsafeMarkup } from '../../shared/safe-text';
import {
  CHOICE_TYPES,
  CONDITION_OPERATORS,
  FORM_LIMITS,
  QUESTION_TYPES,
  QuestionDefinition,
  TEXT_TYPES,
} from './question.types';

export interface DefinitionIssue {
  field: string;
  issue: string;
  /** True when the problem is unsafe markup (maps to MENTOR_UNSAFE_MARKUP). */
  unsafe?: boolean;
}

const scalar = Joi.alternatives().try(Joi.string().max(500), Joi.number(), Joi.boolean());

export const questionSchema = Joi.object<QuestionDefinition>({
  key: Joi.string().pattern(/^[a-z][a-z0-9_]{0,63}$/).required().messages({
    'string.pattern.base': 'key must be snake_case, start with a letter, max 64 chars',
  }),
  type: Joi.string().valid(...QUESTION_TYPES).required(),
  label: Joi.string().trim().min(1).max(FORM_LIMITS.labelMax).required(),
  helpText: Joi.string().trim().max(FORM_LIMITS.helpTextMax).allow(''),
  required: Joi.boolean().default(false),
  order: Joi.number().integer().min(0).max(10000).required(),
  validation: Joi.object({
    minLength: Joi.number().integer().min(0).max(FORM_LIMITS.hardTextMax),
    maxLength: Joi.number().integer().min(1).max(FORM_LIMITS.hardTextMax),
    min: Joi.number(),
    max: Joi.number(),
    integer: Joi.boolean(),
    minSelections: Joi.number().integer().min(0).max(FORM_LIMITS.maxOptions),
    maxSelections: Joi.number().integer().min(1).max(FORM_LIMITS.maxOptions),
  }),
  options: Joi.array()
    .items(
      Joi.object({
        value: Joi.string().pattern(/^[A-Za-z0-9_.-]{1,64}$/).required(),
        label: Joi.string().trim().min(1).max(FORM_LIMITS.labelMax).required(),
      }),
    )
    .max(FORM_LIMITS.maxOptions),
  visibleWhen: Joi.object({
    questionKey: Joi.string().required(),
    operator: Joi.string().valid(...CONDITION_OPERATORS).required(),
    value: Joi.alternatives().try(scalar, Joi.array().items(scalar).min(1).max(FORM_LIMITS.maxOptions)),
  }),
});

export const questionsSchema = Joi.array().items(questionSchema).max(FORM_LIMITS.maxQuestions);

/**
 * Semantic checks that Joi cannot express: unique keys/orders, type-specific
 * settings, unsafe markup, and condition references that only point backwards.
 * Returns every issue found so builders can fix them in one round trip.
 */
export function validateFormDefinition(questions: QuestionDefinition[]): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const sorted = sortQuestions(questions);
  const seenKeys = new Map<string, QuestionDefinition>();
  const seenOrders = new Set<number>();

  sorted.forEach((q) => {
    const at = `questions[${q.key}]`;

    if (seenKeys.has(q.key)) issues.push({ field: `${at}.key`, issue: 'duplicate question key' });
    if (seenOrders.has(q.order)) issues.push({ field: `${at}.order`, issue: `duplicate order ${q.order}` });

    const texts: Array<[string, string | undefined]> = [
      ['label', q.label],
      ['helpText', q.helpText],
      ...(q.options ?? []).map((o, i): [string, string] => [`options[${i}].label`, o.label]),
    ];
    for (const [field, value] of texts) {
      const unsafe = typeof value === 'string' ? findUnsafeMarkup(value) : null;
      if (unsafe) issues.push({ field: `${at}.${field}`, issue: unsafe, unsafe: true });
    }

    const isChoice = CHOICE_TYPES.has(q.type);
    if (isChoice) {
      if (!q.options || q.options.length < 2) {
        issues.push({ field: `${at}.options`, issue: 'choice questions need at least 2 options' });
      } else {
        const values = q.options.map((o) => o.value);
        if (new Set(values).size !== values.length) {
          issues.push({ field: `${at}.options`, issue: 'option values must be unique' });
        }
      }
    } else if (q.options?.length) {
      issues.push({ field: `${at}.options`, issue: `options are only allowed for ${[...CHOICE_TYPES].join('/')}` });
    }

    const v = q.validation ?? {};
    if ((v.minLength !== undefined || v.maxLength !== undefined) && !TEXT_TYPES.has(q.type)) {
      issues.push({ field: `${at}.validation`, issue: 'minLength/maxLength apply to text questions only' });
    }
    if (v.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) {
      issues.push({ field: `${at}.validation`, issue: 'minLength must be <= maxLength' });
    }
    if ((v.min !== undefined || v.max !== undefined || v.integer !== undefined) && q.type !== 'number') {
      issues.push({ field: `${at}.validation`, issue: 'min/max/integer apply to number questions only' });
    }
    if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
      issues.push({ field: `${at}.validation`, issue: 'min must be <= max' });
    }
    if ((v.minSelections !== undefined || v.maxSelections !== undefined) && q.type !== 'multi_choice') {
      issues.push({ field: `${at}.validation`, issue: 'min/maxSelections apply to multi_choice only' });
    }
    if (v.minSelections !== undefined && v.maxSelections !== undefined && v.minSelections > v.maxSelections) {
      issues.push({ field: `${at}.validation`, issue: 'minSelections must be <= maxSelections' });
    }

    if (q.visibleWhen) {
      issues.push(...validateCondition(q, seenKeys, at));
    }

    seenKeys.set(q.key, q);
    seenOrders.add(q.order);
  });

  return issues;
}

function validateCondition(
  q: QuestionDefinition,
  earlier: Map<string, QuestionDefinition>,
  at: string,
): DefinitionIssue[] {
  const cond = q.visibleWhen!;
  const field = `${at}.visibleWhen`;
  const target = earlier.get(cond.questionKey);

  if (cond.questionKey === q.key) return [{ field, issue: 'a question cannot depend on itself' }];
  if (!target) {
    return [{ field, issue: `questionKey '${cond.questionKey}' must reference an earlier question` }];
  }

  const needsValue = cond.operator === 'equals' || cond.operator === 'not_equals' || cond.operator === 'in';
  if (!needsValue) {
    return cond.value === undefined ? [] : [{ field, issue: `operator '${cond.operator}' takes no value` }];
  }
  if (cond.value === undefined) return [{ field, issue: `operator '${cond.operator}' requires a value` }];
  if (cond.operator === 'in' && !Array.isArray(cond.value)) {
    return [{ field, issue: "operator 'in' requires an array value" }];
  }
  if (cond.operator !== 'in' && Array.isArray(cond.value)) {
    return [{ field, issue: `operator '${cond.operator}' requires a single value` }];
  }

  const values = Array.isArray(cond.value) ? cond.value : [cond.value];
  const issues: DefinitionIssue[] = [];
  for (const value of values) {
    if (CHOICE_TYPES.has(target.type)) {
      if (!target.options?.some((o) => o.value === value)) {
        issues.push({ field, issue: `'${String(value)}' is not an option of '${target.key}'` });
      }
    } else if (target.type === 'boolean' && typeof value !== 'boolean') {
      issues.push({ field, issue: `value must be boolean for '${target.key}'` });
    } else if (target.type === 'number' && typeof value !== 'number') {
      issues.push({ field, issue: `value must be a number for '${target.key}'` });
    } else if (!['boolean', 'number'].includes(target.type) && typeof value !== 'string') {
      issues.push({ field, issue: `value must be a string for '${target.key}'` });
    }
  }
  return issues;
}

/** Canonical ordering: by `order`, then key – independent of input order. */
export function sortQuestions(questions: QuestionDefinition[]): QuestionDefinition[] {
  return [...questions].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/** Stable content hash used for change detection and idempotent publishes. */
export function hashQuestions(questions: QuestionDefinition[]): string {
  return createHash('sha256').update(stableStringify(sortQuestions(questions))).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
