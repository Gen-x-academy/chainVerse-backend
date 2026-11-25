import { classify } from './reconciliation-classifier';

const hold = { ref: 'h1', kind: 'hold' as const, amountMinor: 100, currency: 'USDC', externalRef: 'x1' };

describe('classify', () => {
  it('matches equal amounts and ignores intents', () => {
    const r = classify(
      [hold, { ref: 'i1', kind: 'intent', amountMinor: 5, currency: 'USDC' }],
      [{ externalRef: 'x1', amountMinor: 100, currency: 'USDC' }],
    );
    expect(r.map((c) => c.type)).toEqual(['matched', 'matched']);
  });

  it('flags missing external, missing internal, amount and currency mismatches', () => {
    const r = classify(
      [
        hold,
        { ...hold, ref: 'h2', externalRef: 'x2', amountMinor: 50 },
        { ...hold, ref: 'h3', externalRef: 'x3' },
        { ...hold, ref: 'h4', externalRef: 'nope' },
      ],
      [
        { externalRef: 'x1', amountMinor: 90, currency: 'USDC' },
        { externalRef: 'x2', amountMinor: 50, currency: 'XLM' },
        { externalRef: 'x3', amountMinor: 100, currency: 'USDC' },
        { externalRef: 'x9', amountMinor: 1, currency: 'USDC' },
      ],
    );
    const by = Object.fromEntries(r.map((c) => [c.key, c.type]));
    expect(by['int:h1']).toBe('amount_mismatch');
    expect(by['int:h2']).toBe('currency_mismatch');
    expect(by['int:h3']).toBe('matched');
    expect(by['int:h4']).toBe('missing_external');
    expect(by['ext:x9']).toBe('missing_internal');
    expect(r.find((c) => c.key === 'int:h1')?.deltaMinor).toBe(-10);
  });

  it('flags duplicated external transactions and is deterministic', () => {
    const ext = [
      { externalRef: 'x1', amountMinor: 100, currency: 'USDC' },
      { externalRef: 'x1', amountMinor: 100, currency: 'USDC' },
    ];
    const a = classify([hold], ext);
    expect(a[0].type).toBe('duplicate_external');
    expect(classify([hold], ext)).toEqual(a);
  });
});
