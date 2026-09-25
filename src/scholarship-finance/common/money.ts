/**
 * Fixed-point money helpers.
 *
 * Every amount in the scholarship finance domain is held as an integer number
 * of the asset's smallest unit (Stellar "stroops", 7 decimal places) and
 * persisted as a base-10 string. Floating point is never used for money.
 */
export const ASSET_DECIMALS = 7;
const SCALE = 10n ** BigInt(ASSET_DECIMALS);

/** Decimal amount string accepted by the API, e.g. "250", "12.5", "0.0000001". */
export const DECIMAL_AMOUNT_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,7})?$/;

/** Converts a decimal amount string ("12.5") to integer minor units (125000000n). */
export function toMinorUnits(amount: string): bigint {
  if (!DECIMAL_AMOUNT_PATTERN.test(amount)) {
    throw new Error(`Invalid amount "${amount}"`);
  }
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(ASSET_DECIMALS, '0'));
}

/** Converts integer minor units back to a normalised decimal string. */
export function fromMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE)
    .toString()
    .padStart(ASSET_DECIMALS, '0')
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}
