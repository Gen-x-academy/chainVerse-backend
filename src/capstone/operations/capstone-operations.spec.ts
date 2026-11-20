import { ROLLOUT_PLAN, canAdvance, getRunbook, runConcurrently } from './capstone-operations';

describe('capstone operations', () => {
  it('returns runbooks and rejects unknown types', () => {
    expect(getRunbook('outage').length).toBeGreaterThan(0);
    expect(() => getRunbook('unknown')).toThrow('CAPSTONE_RUNBOOK_NOT_FOUND');
  });

  it('runs tasks concurrently in order', async () => {
    const tasks = [1, 2, 3, 4].map((n) => () => Promise.resolve(n * 2));
    await expect(runConcurrently(tasks, 2)).resolves.toEqual([2, 4, 6, 8]);
  });

  it('only advances one journey stage at a time', () => {
    expect(canAdvance('proposal', 'approved')).toBe(true);
    expect(canAdvance('proposal', 'published')).toBe(false);
  });

  it('ends rollout at 100 percent', () => {
    expect(ROLLOUT_PLAN[ROLLOUT_PLAN.length - 1].percent).toBe(100);
  });
});
