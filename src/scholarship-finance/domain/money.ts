import { RoundingMode } from './finance.enums';

/**
 * All amounts are integer minor units of the asset (e.g. stroops for XLM,
 * cents for USD). Arithmetic that can overflow or needs rounding is done in
 * BigInt; results are returned as numbers after a safe-integer check.
 */
export function assertSafeMinor(value: number, field = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${field} must be a non-negative safe integer of minor units`,
    );
  }
  return value;
}

/** Divide `numerator / denominator` (both non-negative) using the given rounding mode. */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  switch (mode) {
    case RoundingMode.FLOOR:
      return quotient;
    case RoundingMode.CEIL:
      return quotient + 1n;
    case RoundingMode.HALF_UP:
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
    case RoundingMode.HALF_EVEN: {
      const twice = remainder * 2n;
      if (twice > denominator) return quotient + 1n;
      if (twice < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : quotient + 1n;
    }
  }
}

export function toSafeNumber(value: bigint, field = 'amount'): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) {
    throw new RangeError(`${field} is outside the safe integer range`);
  }
  return Number(value);
}
