import {
  MIN_SAMPLE,
  TrustSignals,
  computeTrustIndicators,
  emptySignals,
} from './trust-indicators';

const find = (s: TrustSignals, key: string) =>
  computeTrustIndicators(s).find((i) => i.key === key)!;

describe('computeTrustIndicators', () => {
  it('handles a mentor with no data without inventing scores', () => {
    const out = computeTrustIndicators(emptySignals());
    expect(out.find((i) => i.key === 'completion')!.level).toBe('insufficient_data');
    expect(out.find((i) => i.key === 'response')!.level).toBe('insufficient_data');
    expect(out.find((i) => i.key === 'delivery')!.level).toBe('insufficient_data');
    expect(out.find((i) => i.key === 'verification')!.level).toBe('low');
  });

  it('hides rate-based indicators below the minimum sample', () => {
    const s = { ...emptySignals(), responseSampleSize: MIN_SAMPLE - 1, respondedWithin48h: MIN_SAMPLE - 1 };
    expect(find(s, 'response').level).toBe('insufficient_data');
    expect(find({ ...s, responseSampleSize: MIN_SAMPLE, respondedWithin48h: MIN_SAMPLE }, 'response').level).toBe('high');
  });

  it('grades profile completion by ratio', () => {
    const base = { ...emptySignals(), profileFieldsTotal: 10 };
    expect(find({ ...base, profileFieldsCompleted: 10 }, 'completion').level).toBe('high');
    expect(find({ ...base, profileFieldsCompleted: 6 }, 'completion').level).toBe('medium');
    expect(find({ ...base, profileFieldsCompleted: 2 }, 'completion').level).toBe('low');
  });

  it('grades verification by verified credential count', () => {
    const s = emptySignals();
    expect(find({ ...s, verifiedCredentials: 1 }, 'verification').level).toBe('medium');
    expect(find({ ...s, verifiedCredentials: 2 }, 'verification').level).toBe('high');
  });

  it('lowers safety with upheld reports only', () => {
    const s = emptySignals();
    expect(find(s, 'safety').level).toBe('high');
    expect(find({ ...s, upheldSafetyReports: 1 }, 'safety').level).toBe('medium');
    expect(find({ ...s, upheldSafetyReports: 2 }, 'safety').level).toBe('low');
  });

  it('clamps impossible or malformed inputs', () => {
    const s = {
      ...emptySignals(),
      sessionsScheduled: 10,
      sessionsDelivered: 500,
      profileFieldsTotal: 4,
      profileFieldsCompleted: -3,
      verifiedCredentials: Number.NaN,
    };
    expect(find(s, 'delivery').level).toBe('high');
    expect(find(s, 'completion').level).toBe('low');
    expect(find(s, 'verification').level).toBe('low');
  });

  it('is deterministic and exposes only key, level and meaning', () => {
    const s = { ...emptySignals(), profileFieldsTotal: 5, profileFieldsCompleted: 5 };
    expect(computeTrustIndicators(s)).toEqual(computeTrustIndicators({ ...s }));
    for (const i of computeTrustIndicators(s)) {
      expect(Object.keys(i).sort()).toEqual(['key', 'level', 'meaning']);
      expect(i.meaning.length).toBeGreaterThan(10);
    }
  });
});
