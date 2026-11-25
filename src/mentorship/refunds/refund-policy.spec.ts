import {
  applyBps,
  calculateRefund,
  CancellationPolicySnapshot,
  describeBoundary,
  validatePolicy,
} from './refund-policy';

const policy: CancellationPolicySnapshot = {
  version: 'v1',
  timeZone: 'America/New_York',
  tiers: [
    { minHoursBeforeStart: 48, refundBps: 10_000 },
    { minHoursBeforeStart: 24, refundBps: 5_000 },
  ],
  lateRefundBps: 0,
};
const start = new Date('2026-03-08T15:00:00Z');
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);
const calc = (cancelledAt: Date, over: Partial<Parameters<typeof calculateRefund>[0]> = {}) =>
  calculateRefund({
    heldAmountMinor: 10_001,
    sessionStart: start,
    cancelledAt,
    cancelledBy: 'learner',
    policy,
    ...over,
  });

describe('calculateRefund', () => {
  it('refunds in full at or beyond the first threshold, exactly on the boundary included', () => {
    expect(calc(hoursBefore(48)).refundMinor).toBe(10_001);
    expect(calc(hoursBefore(72)).rule).toBe('tier');
  });

  it('is partial in the middle tier and nothing when late', () => {
    expect(calc(hoursBefore(47.99)).refundBps).toBe(5_000);
    expect(calc(hoursBefore(24)).refundMinor).toBe(5_000);
    expect(calc(hoursBefore(23.99))).toMatchObject({ refundMinor: 0, rule: 'late' });
  });

  it('rounds down and keeps every minor unit accounted for', () => {
    const r = calc(hoursBefore(30));
    expect(r.refundMinor + r.retainedMinor).toBe(10_001);
    expect(r.refundMinor).toBe(5_000);
  });

  it('refunds in full when the mentor or system cancels, however late', () => {
    expect(calc(hoursBefore(1), { cancelledBy: 'mentor' })).toMatchObject({
      refundMinor: 10_001,
      rule: 'mentor_or_system_cancelled',
    });
    expect(calc(hoursBefore(-1), { cancelledBy: 'system' }).refundBps).toBe(10_000);
  });

  it('treats a cancellation after the start as late', () => {
    expect(calc(hoursBefore(-2))).toMatchObject({ refundMinor: 0, rule: 'session_started' });
  });

  it('is unaffected by a daylight-saving change between cancellation and start', () => {
    // US clocks jump forward on 2026-03-08; the 48h boundary is 48 real hours.
    expect(calc(new Date('2026-03-06T15:00:00Z')).refundBps).toBe(10_000);
    expect(calc(new Date('2026-03-06T15:00:01Z')).refundBps).toBe(5_000);
  });

  it('is deterministic and reports when the matched tier stops applying', () => {
    const a = calc(hoursBefore(30));
    expect(calc(hoursBefore(30))).toEqual(a);
    expect(a.nextBoundaryAt).toEqual(hoursBefore(24));
  });

  it('rejects an invalid policy or amount', () => {
    expect(() => calc(hoursBefore(10), { heldAmountMinor: -1 })).toThrow(RangeError);
    expect(() => calc(hoursBefore(10), { policy: { ...policy, lateRefundBps: 20_000 } })).toThrow(RangeError);
    expect(validatePolicy({ ...policy, tiers: [] })).not.toEqual([]);
    expect(validatePolicy({ ...policy, timeZone: 'Mars/Base' })).not.toEqual([]);
    expect(validatePolicy({ ...policy, tiers: [policy.tiers[0], policy.tiers[0]] })).not.toEqual([]);
  });
});

describe('helpers', () => {
  it('applyBps floors and handles large amounts', () => {
    expect(applyBps(3, 3_333)).toBe(0);
    expect(applyBps(10_000_000_000_000, 5_000)).toBe(5_000_000_000_000);
  });

  it('describes a boundary in the session zone', () => {
    expect(describeBoundary(new Date('2026-01-15T17:00:00Z'), 'America/New_York')).toContain('12:00');
  });
});
