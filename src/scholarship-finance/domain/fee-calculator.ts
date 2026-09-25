import { FeeEvent, FeeKind, RoundingMode } from './finance.enums';
import { assertSafeMinor, divideRounded, toSafeNumber } from './money';

export const BASIS_POINTS_DENOMINATOR = 10_000n;

export interface FeeRuleInput {
  kind: FeeKind;
  appliesTo: FeeEvent;
  basisPoints: number;
  fixedMinor: number;
  minMinor?: number | null;
  maxMinor?: number | null;
}

export interface FeeScheduleRef {
  id: string | null;
  version: number | null;
  rounding: RoundingMode;
  rules: FeeRuleInput[];
}

export interface FeeLine {
  kind: FeeKind;
  basisPoints: number;
  fixedMinor: number;
  amountMinor: number;
}

export interface FeeBreakdown {
  event: FeeEvent;
  feeScheduleId: string | null;
  feeScheduleVersion: number | null;
  rounding: RoundingMode;
  /** Amount the payer sends / the program is debited. */
  grossMinor: number;
  /** Amount the program is credited (deposit) or the recipient receives (disbursement). */
  netMinor: number;
  platformFeeMinor: number;
  networkFeeMinor: number;
  totalFeeMinor: number;
  lines: FeeLine[];
}

/** A zero-fee schedule used when a tenant has not configured fees for an asset. */
export const NO_FEE_SCHEDULE: FeeScheduleRef = {
  id: null,
  version: null,
  rounding: RoundingMode.HALF_UP,
  rules: [],
};

function computeRule(
  base: bigint,
  rule: FeeRuleInput,
  rounding: RoundingMode,
): bigint {
  let fee =
    divideRounded(
      base * BigInt(rule.basisPoints),
      BASIS_POINTS_DENOMINATOR,
      rounding,
    ) + BigInt(rule.fixedMinor);
  if (rule.minMinor != null && fee < BigInt(rule.minMinor))
    fee = BigInt(rule.minMinor);
  if (rule.maxMinor != null && fee > BigInt(rule.maxMinor))
    fee = BigInt(rule.maxMinor);
  return fee;
}

/**
 * Pure fee calculation.
 *
 * - DEPOSIT (inclusive): `amountMinor` is what actually arrived. Fees are
 *   deducted and the program is credited `net = gross - fees`. Fees that
 *   would consume the whole deposit are rejected rather than silently zeroing it.
 * - DISBURSEMENT (exclusive): `amountMinor` is what the recipient must
 *   receive. Fees are added on top, so the recipient amount is never reduced;
 *   the program is debited `gross = amount + fees`.
 *
 * Fees are always computed on `amountMinor`, never compounded on each other.
 */
export function calculateFees(
  event: FeeEvent,
  amountMinor: number,
  schedule: FeeScheduleRef,
): FeeBreakdown {
  assertSafeMinor(amountMinor);
  const base = BigInt(amountMinor);
  const lines: FeeLine[] = [];
  let platform = 0n;
  let network = 0n;

  for (const rule of schedule.rules.filter((r) => r.appliesTo === event)) {
    const fee = computeRule(base, rule, schedule.rounding);
    lines.push({
      kind: rule.kind,
      basisPoints: rule.basisPoints,
      fixedMinor: rule.fixedMinor,
      amountMinor: toSafeNumber(fee, 'fee'),
    });
    if (rule.kind === FeeKind.PLATFORM) platform += fee;
    else network += fee;
  }

  const total = platform + network;
  let gross: bigint;
  let net: bigint;
  if (event === FeeEvent.DEPOSIT) {
    if (total >= base) {
      throw new RangeError('Configured fees meet or exceed the deposit amount');
    }
    gross = base;
    net = base - total;
  } else {
    gross = base + total;
    net = base;
  }

  return {
    event,
    feeScheduleId: schedule.id,
    feeScheduleVersion: schedule.version,
    rounding: schedule.rounding,
    grossMinor: toSafeNumber(gross, 'gross'),
    netMinor: toSafeNumber(net, 'net'),
    platformFeeMinor: toSafeNumber(platform, 'platformFee'),
    networkFeeMinor: toSafeNumber(network, 'networkFee'),
    totalFeeMinor: toSafeNumber(total, 'totalFee'),
    lines,
  };
}
