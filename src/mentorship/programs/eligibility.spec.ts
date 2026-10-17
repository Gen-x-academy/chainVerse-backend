import { evaluateEligibility, sanitizeAttributes } from './eligibility';

describe('mentorship eligibility', () => {
  it('filters unauthorized attributes before evaluation', () => {
    expect(sanitizeAttributes({
      attributes: { role: 'mentor', age: 17, salary: 1, geography: 'NG' },
      guardianConsent: false,
      geographyConsent: true,
    })).toEqual({ role: 'mentor', geography: 'NG' });
  });

  it('returns explainable missing-data results without guessing', () => {
    const result = evaluateEligibility([
      { key: 'role', operator: 'equals', value: 'mentor' },
      { key: 'courseProgress', operator: 'gte', value: 80 },
    ], { attributes: { role: 'mentor' } });
    expect(result.eligible).toBe(false);
    expect(result.missing).toEqual(['courseProgress']);
    expect(result.decisions[0]).toMatchObject({ key: 'role', passed: true });
  });

  it('evaluates composed rules deterministically', () => {
    const rules = [
      { key: 'role', operator: 'equals' as const, value: 'mentor' },
      { key: 'skills', operator: 'contains' as const, value: 'rust' },
      { key: 'courseProgress', operator: 'gte' as const, value: 80 },
    ];
    const context = { attributes: { role: 'mentor', skills: ['rust'], courseProgress: 90 } };
    expect(evaluateEligibility(rules, context)).toEqual(evaluateEligibility(rules, context));
    expect(evaluateEligibility(rules, context).eligible).toBe(true);
  });
});
