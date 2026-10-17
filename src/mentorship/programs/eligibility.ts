import { EligibilityRuleDto } from './dto/program.dto';

const PUBLIC_KEYS = new Set([
  'role', 'organizationIds', 'courseProgress', 'skills', 'prerequisiteIds',
]);
const CONSENT_KEYS = new Set(['age', 'geography']);

export interface EligibilityContext {
  attributes: Record<string, unknown>;
  guardianConsent?: boolean;
  geographyConsent?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  missing: string[];
  decisions: Array<{ key: string; passed: boolean | null; explanation: string }>;
}

export function sanitizeAttributes(context: EligibilityContext): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context.attributes ?? {})) {
    if (PUBLIC_KEYS.has(key)) output[key] = value;
    if (key === 'age' && context.guardianConsent === true) output[key] = value;
    if (key === 'geography' && context.geographyConsent === true) output[key] = value;
  }
  return output;
}

function matches(actual: unknown, rule: EligibilityRuleDto): boolean {
  switch (rule.operator) {
    case 'equals': return actual === rule.value;
    case 'contains': return Array.isArray(actual) && actual.includes(rule.value);
    case 'gte': return typeof actual === 'number' && typeof rule.value === 'number' && actual >= rule.value;
    case 'in': return Array.isArray(rule.value) && rule.value.includes(actual as never);
  }
}

export function evaluateEligibility(rules: EligibilityRuleDto[], context: EligibilityContext): EligibilityResult {
  const attributes = sanitizeAttributes(context);
  const missing: string[] = [];
  const decisions = rules.map((rule) => {
    if (!(rule.key in attributes)) {
      if (rule.required !== false) missing.push(rule.key);
      return { key: rule.key, passed: null, explanation: `Provide ${rule.key} to evaluate this requirement.` };
    }
    const passed = matches(attributes[rule.key], rule);
    return {
      key: rule.key,
      passed,
      explanation: passed ? `Requirement ${rule.key} was satisfied.` : `Requirement ${rule.key} was not satisfied.`,
    };
  });
  return { eligible: missing.length === 0 && decisions.every((d) => d.passed === true), missing, decisions };
}
