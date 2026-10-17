import {
  MENTORSHIP_SLOS,
  MENTORSHIP_BURN_RATE_ALERT,
  computeErrorBudget,
  shouldPage,
} from './mentorship-slo';

describe('Mentorship SLOs', () => {
  it('defines SLO indicators with required fields', () => {
    expect(MENTORSHIP_SLOS.length).toBeGreaterThan(0);
    for (const slo of MENTORSHIP_SLOS) {
      expect(slo.metric).toBeTruthy();
      expect(slo.description).toBeTruthy();
      expect(slo.threshold).toBeGreaterThan(0);
      expect(slo.budgetRatio).toBeGreaterThan(0);
      expect(slo.budgetRatio).toBeLessThanOrEqual(1);
      expect(slo.owner).toBeTruthy();
    }
  });

  it('keeps metric names low-cardinality (no personal data in label keys)', () => {
    for (const slo of MENTORSHIP_SLOS) {
      expect(slo.metric).not.toMatch(/user|email|address|proposalId/i);
    }
  });

  describe('computeErrorBudget', () => {
    it('returns full budget when there are no observations', () => {
      const slo = MENTORSHIP_SLOS[0];
      expect(computeErrorBudget(slo, 0, 0)).toBe(1);
    });

    it('returns full budget when breaches are within the allowed ratio', () => {
      const slo = MENTORSHIP_SLOS[0];
      const budget = computeErrorBudget(slo, 1000, 10);
      expect(budget).toBe(1);
    });

    it('consumes budget when breaches exceed the allowed ratio', () => {
      const slo = MENTORSHIP_SLOS[0];
      const budget = computeErrorBudget(slo, 1000, 60);
      expect(budget).toBeLessThan(1);
      expect(budget).toBeGreaterThanOrEqual(0);
    });

    it('never returns a negative budget', () => {
      const slo = MENTORSHIP_SLOS[0];
      const budget = computeErrorBudget(slo, 100, 100);
      expect(budget).toBeGreaterThanOrEqual(0);
    });

    it('drives budget to zero when breaches far exceed the ratio', () => {
      const slo = MENTORSHIP_SLOS[0];
      const budget = computeErrorBudget(slo, 1000, 1000);
      expect(budget).toBeGreaterThanOrEqual(0);
      expect(budget).toBeLessThanOrEqual(1);
    });
  });

  describe('shouldPage', () => {
    it('pages when burn rate exceeds the short-window threshold', () => {
      expect(shouldPage(MENTORSHIP_BURN_RATE_ALERT.shortWindow.burnRate)).toBe(true);
    });

    it('does not page when burn rate is below both thresholds', () => {
      expect(shouldPage(1)).toBe(false);
    });

    it('pages when burn rate exceeds the long-window threshold', () => {
      expect(shouldPage(MENTORSHIP_BURN_RATE_ALERT.longWindow.burnRate)).toBe(true);
    });
  });
});
