import { assertIpTerm, captureProvenance, transitionPublication, validateAttribution } from './capstone-attribution';

describe('capstone attribution', () => {
  it('validates contributor shares', () => {
    expect(() => validateAttribution([{ userId: 'a', role: 'lead', share: 100 }])).not.toThrow();
    expect(() => validateAttribution([{ userId: 'a', role: 'lead', share: 50 }])).toThrow('CAPSTONE_ATTRIBUTION_TOTAL_INVALID');
  });

  it('hashes output content for provenance', () => {
    const record = captureProvenance('o1', 'hello', ['a']);
    expect(record.hash).toHaveLength(64);
  });

  it('rejects unknown IP terms', () => {
    expect(() => assertIpTerm('mit')).not.toThrow();
    expect(() => assertIpTerm('unknown')).toThrow('CAPSTONE_IP_TERM_INVALID');
  });

  it('enforces publication approval flow', () => {
    expect(transitionPublication('draft', 'pending')).toBe('pending');
    expect(() => transitionPublication('draft', 'approved')).toThrow('CAPSTONE_PUBLICATION_TRANSITION_INVALID');
  });
});
