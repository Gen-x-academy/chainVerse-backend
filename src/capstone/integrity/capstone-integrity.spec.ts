import { hasCitations, needsEthicsReview, similarityScore, triagePriority, validateConcernReport } from './capstone-integrity';

describe('capstone integrity', () => {
  it('scores similarity and detects citations', () => {
    expect(similarityScore('a b c', 'a b c')).toBe(1);
    expect(similarityScore('a b', 'c d')).toBe(0);
    expect(hasCitations('As shown [1].')).toBe(true);
  });

  it('flags projects for ethics review', () => {
    expect(needsEthicsReview(['minors'])).toBe(true);
    expect(needsEthicsReview(['robotics'])).toBe(false);
  });

  it('validates concern reports', () => {
    expect(() => validateConcernReport({ reporterId: 'u1', projectId: 'p1', reason: 'short' })).toThrow('CAPSTONE_REPORT_REASON_TOO_SHORT');
  });

  it('prioritises triage', () => {
    expect(triagePriority('safety', 1)).toBe('high');
    expect(triagePriority('ethics', 1)).toBe('medium');
    expect(triagePriority('plagiarism', 1)).toBe('low');
  });
});
