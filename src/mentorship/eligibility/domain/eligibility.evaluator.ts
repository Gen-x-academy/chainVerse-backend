import * as Joi from 'joi';
import { findUnsafeMarkup, isSafeLink } from '../../shared/safe-text';
import { AnswerValue } from '../../forms/domain/question.types';
import {
  ApplicantFacts,
  CheckOutcome,
  EligibilityResult,
  EligibilityRule,
  PublicCheck,
  RULE_TYPES,
  WINDOW_RULE_ID,
} from './eligibility-rule.types';

const SENSITIVE_MESSAGE = 'This program has additional requirements that are not met.';

const scalar = Joi.alternatives().try(Joi.string().max(500), Joi.number(), Joi.boolean());

const paramsByType: Record<string, Joi.ObjectSchema> = {
  min_completed_courses: Joi.object({ count: Joi.number().integer().min(1).max(1000).required() }),
  completed_course: Joi.object({
    courseIds: Joi.array().items(Joi.string().pattern(/^[a-f0-9]{24}$/i)).min(1).max(100).unique().required(),
    match: Joi.string().valid('any', 'all').default('any'),
  }),
  max_active_applications: Joi.object({ max: Joi.number().integer().min(0).max(100).required() }),
  answer_in: Joi.object({
    questionKey: Joi.string().pattern(/^[a-z][a-z0-9_]{0,63}$/).required(),
    values: Joi.array().items(scalar).min(1).max(100).required(),
  }),
  answer_number_range: Joi.object({
    questionKey: Joi.string().pattern(/^[a-z][a-z0-9_]{0,63}$/).required(),
    min: Joi.number(),
    max: Joi.number(),
  })
    .or('min', 'max')
    .custom((v, h) => (v.min !== undefined && v.max !== undefined && v.min > v.max ? h.error('any.invalid') : v)),
};

export const ruleSchema = Joi.object<EligibilityRule>({
  id: Joi.string().pattern(/^[a-z0-9][a-z0-9_-]{0,63}$/).invalid(WINDOW_RULE_ID).required(),
  type: Joi.string().valid(...RULE_TYPES).required(),
  params: Joi.object().required(),
  publicMessage: Joi.string().trim().min(1).max(500).required(),
  remediationUrl: Joi.string().max(2000),
  sensitive: Joi.boolean().default(false),
});

export const rulesSchema = Joi.array().items(ruleSchema).max(50).unique('id');

/**
 * Validates type-specific params, unsafe markup and links. Returns field
 * issues and the rules with normalised params (defaults applied).
 */
export function validateRules(rules: EligibilityRule[]): {
  issues: Array<{ field: string; issue: string; unsafe?: boolean }>;
  normalised: EligibilityRule[];
} {
  const issues: Array<{ field: string; issue: string; unsafe?: boolean }> = [];
  const normalised = rules.map((rule) => {
    const at = `rules[${rule.id}]`;
    const { error, value } = paramsByType[rule.type].validate(rule.params, { abortEarly: false });
    if (error) {
      for (const d of error.details) issues.push({ field: `${at}.params.${d.path.join('.')}`, issue: d.message.replace(/"/g, '') });
    }
    const unsafe = findUnsafeMarkup(rule.publicMessage);
    if (unsafe) issues.push({ field: `${at}.publicMessage`, issue: unsafe, unsafe: true });
    if (rule.remediationUrl && !isSafeLink(rule.remediationUrl)) {
      issues.push({ field: `${at}.remediationUrl`, issue: 'must be an https URL or a same-origin path starting with /' });
    }
    return { ...rule, params: value ?? rule.params };
  });
  return { issues, normalised };
}

/**
 * Pure, deterministic evaluation. Same rules + same facts → same result.
 *
 * Overall outcome: `fail` if any check fails, otherwise `needs_information`
 * if any check lacks data, otherwise `pass`.
 */
export function evaluateEligibility(rules: EligibilityRule[], facts: ApplicantFacts): EligibilityResult {
  const checks: PublicCheck[] = [windowCheck(facts)];

  for (const rule of rules) {
    const raw = evaluateRule(rule, facts);
    checks.push(toPublic(rule, raw.outcome, raw.questionKey));
  }

  const outcome: CheckOutcome = checks.some((c) => c.outcome === 'fail')
    ? 'fail'
    : checks.some((c) => c.outcome === 'needs_information')
      ? 'needs_information'
      : 'pass';

  return { outcome, checks };
}

function windowCheck(f: ApplicantFacts): PublicCheck {
  const base = { ruleId: WINDOW_RULE_ID, type: WINDOW_RULE_ID } as const;
  if (f.programStatus !== 'open') {
    return { ...base, outcome: 'fail', message: 'This program is not accepting applications.' };
  }
  if (f.applicationOpensAt && f.now < f.applicationOpensAt) {
    return { ...base, outcome: 'fail', message: `Applications open on ${f.applicationOpensAt.toISOString()}.` };
  }
  if (f.applicationClosesAt && f.now >= f.applicationClosesAt) {
    return { ...base, outcome: 'fail', message: 'The application window has closed.' };
  }
  return { ...base, outcome: 'pass' };
}

function evaluateRule(rule: EligibilityRule, f: ApplicantFacts): { outcome: CheckOutcome; questionKey?: string } {
  const p = rule.params as Record<string, any>;
  switch (rule.type) {
    case 'min_completed_courses':
      return { outcome: f.completedCourseIds.length >= p.count ? 'pass' : 'fail' };

    case 'completed_course': {
      const done = new Set(f.completedCourseIds.map(String));
      const ids: string[] = p.courseIds;
      const ok = p.match === 'all' ? ids.every((id) => done.has(id)) : ids.some((id) => done.has(id));
      return { outcome: ok ? 'pass' : 'fail' };
    }

    case 'max_active_applications':
      return { outcome: f.activeApplicationCount <= p.max ? 'pass' : 'fail' };

    case 'answer_in': {
      const answer = f.answers[p.questionKey];
      if (answer === undefined) return missingAnswer(p.questionKey, f);
      const values: unknown[] = p.values;
      const ok = Array.isArray(answer) ? answer.some((a) => values.includes(a)) : values.includes(answer);
      return { outcome: ok ? 'pass' : 'fail' };
    }

    case 'answer_number_range': {
      const answer: AnswerValue | undefined = f.answers[p.questionKey];
      if (answer === undefined) return missingAnswer(p.questionKey, f);
      if (typeof answer !== 'number') return { outcome: 'fail' };
      const ok = (p.min === undefined || answer >= p.min) && (p.max === undefined || answer <= p.max);
      return { outcome: ok ? 'pass' : 'fail' };
    }

    default:
      // Unknown rule types fail closed.
      return { outcome: 'fail' };
  }
}

/**
 * An unanswered question the form actually asks → needs_information.
 * A rule referencing a question the current form does not contain is a
 * configuration error; fail closed rather than let everyone through.
 */
function missingAnswer(questionKey: string, f: ApplicantFacts): { outcome: CheckOutcome; questionKey?: string } {
  return f.formQuestionKeys.includes(questionKey)
    ? { outcome: 'needs_information', questionKey }
    : { outcome: 'fail' };
}

function toPublic(rule: EligibilityRule, outcome: CheckOutcome, questionKey?: string): PublicCheck {
  if (outcome === 'pass') {
    return rule.sensitive ? { ruleId: rule.id, outcome } : { ruleId: rule.id, type: rule.type, outcome };
  }
  if (rule.sensitive) {
    return { ruleId: rule.id, outcome, message: SENSITIVE_MESSAGE };
  }
  return {
    ruleId: rule.id,
    type: rule.type,
    outcome,
    message: rule.publicMessage,
    ...(rule.remediationUrl && { remediationUrl: rule.remediationUrl }),
    ...(questionKey && { questionKey }),
  };
}
