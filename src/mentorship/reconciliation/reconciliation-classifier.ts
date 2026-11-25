export type LedgerKind = 'intent' | 'hold' | 'release' | 'refund' | 'fee';

export interface InternalEntry {
  ref: string;
  kind: LedgerKind;
  amountMinor: number;
  currency: string;
  externalRef?: string | null;
}

export interface ExternalTx {
  externalRef: string;
  amountMinor: number;
  currency: string;
}

export type MismatchType =
  | 'matched'
  | 'missing_external'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'duplicate_external'
  | 'missing_internal';

export interface Classification {
  key: string;
  type: MismatchType;
  internalRef: string | null;
  externalRef: string | null;
  internalAmountMinor: number | null;
  externalAmountMinor: number | null;
  /** external − internal; null when either side is absent. */
  deltaMinor: number | null;
}

/** Intents are promises, not money movement: they never need an external tx. */
const NEEDS_EXTERNAL: LedgerKind[] = ['hold', 'release', 'refund', 'fee'];

/**
 * Pure and deterministic: same inputs, same output, sorted by key. Internal
 * entries are matched to external transactions by `externalRef`.
 */
export function classify(internal: InternalEntry[], external: ExternalTx[]): Classification[] {
  const extCount = new Map<string, number>();
  for (const e of external) extCount.set(e.externalRef, (extCount.get(e.externalRef) ?? 0) + 1);
  const ext = new Map(external.map((e) => [e.externalRef, e]));
  const used = new Set<string>();
  const out: Classification[] = [];

  for (const i of internal) {
    const base = {
      key: `int:${i.ref}`,
      internalRef: i.ref,
      externalRef: i.externalRef ?? null,
      internalAmountMinor: i.amountMinor,
      externalAmountMinor: null as number | null,
      deltaMinor: null as number | null,
    };
    if (!NEEDS_EXTERNAL.includes(i.kind)) {
      out.push({ ...base, type: 'matched' });
      continue;
    }
    const e = i.externalRef ? ext.get(i.externalRef) : undefined;
    if (!e) {
      out.push({ ...base, type: 'missing_external' });
      continue;
    }
    used.add(e.externalRef);
    const withExt = {
      ...base,
      externalAmountMinor: e.amountMinor,
      deltaMinor: e.amountMinor - i.amountMinor,
    };
    let type: MismatchType = 'matched';
    if ((extCount.get(e.externalRef) ?? 0) > 1) type = 'duplicate_external';
    else if (e.currency !== i.currency) type = 'currency_mismatch';
    else if (e.amountMinor !== i.amountMinor) type = 'amount_mismatch';
    out.push({ ...withExt, type });
  }

  for (const e of ext.values()) {
    if (used.has(e.externalRef)) continue;
    out.push({
      key: `ext:${e.externalRef}`,
      type: 'missing_internal',
      internalRef: null,
      externalRef: e.externalRef,
      internalAmountMinor: null,
      externalAmountMinor: e.amountMinor,
      deltaMinor: null,
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
