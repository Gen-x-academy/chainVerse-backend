import { StrKey } from '@stellar/stellar-sdk';

/** Stellar networks an asset can be configured for. */
export enum StellarNetwork {
  TESTNET = 'testnet',
  PUBLIC = 'public',
}

export enum ScholarshipAssetType {
  NATIVE = 'native',
  CREDIT_ALPHANUM4 = 'credit_alphanum4',
  CREDIT_ALPHANUM12 = 'credit_alphanum12',
}

/**
 * Governance lifecycle. A proposal is inert until a *different* owner/admin
 * approves it; only `active` assets can be paid out. Nothing is edited in
 * place — a change is a new proposal plus disabling the old configuration.
 */
export enum ScholarshipAssetStatus {
  PROPOSED = 'proposed',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/** Stellar amounts are int64 stroops: 7 decimal places, at most. */
export const STELLAR_MAX_DECIMALS = 7;

const ASSET_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/;

/**
 * Normalises the platform `STELLAR_NETWORK` value. `mainnet` and `pubnet` are
 * accepted as aliases for `public` because both appear in operator configs.
 */
export function normaliseNetwork(value: string | undefined): StellarNetwork {
  const lower = (value ?? 'testnet').toLowerCase();
  if (lower === 'public' || lower === 'mainnet' || lower === 'pubnet') {
    return StellarNetwork.PUBLIC;
  }
  return StellarNetwork.TESTNET;
}

export interface AssetDefinition {
  assetType: ScholarshipAssetType;
  code: string;
  issuer: string | null;
  decimals: number;
  network: StellarNetwork;
}

/**
 * Returns the reason an asset definition is unsupported, or `null` when it is
 * acceptable. Runs before anything is persisted so a bad configuration fails
 * at proposal time rather than at payout time.
 */
export function unsupportedAssetReason(
  asset: AssetDefinition,
  platformNetwork: StellarNetwork,
): string | null {
  if (asset.network !== platformNetwork) {
    return `Asset network "${asset.network}" does not match the platform network "${platformNetwork}"`;
  }

  if (
    !Number.isInteger(asset.decimals) ||
    asset.decimals < 0 ||
    asset.decimals > STELLAR_MAX_DECIMALS
  ) {
    return `decimals must be an integer between 0 and ${STELLAR_MAX_DECIMALS}`;
  }

  if (asset.assetType === ScholarshipAssetType.NATIVE) {
    if (asset.issuer) return 'The native asset (XLM) has no issuer';
    if (asset.code !== 'XLM') return 'The native asset must use code "XLM"';
    return null;
  }

  if (!ASSET_CODE_PATTERN.test(asset.code)) {
    return 'Asset code must be 1-12 alphanumeric characters';
  }
  if (
    asset.assetType === ScholarshipAssetType.CREDIT_ALPHANUM4 &&
    asset.code.length > 4
  ) {
    return 'credit_alphanum4 codes are at most 4 characters';
  }
  if (
    asset.assetType === ScholarshipAssetType.CREDIT_ALPHANUM12 &&
    asset.code.length < 5
  ) {
    return 'credit_alphanum12 codes are 5-12 characters';
  }
  if (!asset.issuer || !StrKey.isValidEd25519PublicKey(asset.issuer)) {
    return 'Issued assets require a valid issuer account (G...)';
  }
  return null;
}

/**
 * Validates a decimal amount string against an asset's precision. Returns the
 * canonical 7-decimal form Horizon reports (e.g. `"10.5000000"`), or `null`
 * when the amount is not a positive value representable at that precision.
 */
export function canonicalAmount(
  amount: string,
  decimals: number,
): string | null {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(amount);
  if (!match) return null;

  const whole = match[1];
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;

  const padded = fraction.padEnd(STELLAR_MAX_DECIMALS, '0');
  const stroops = BigInt(whole) * 10_000_000n + BigInt(padded || '0');
  // Positive and within int64.
  if (stroops <= 0n || stroops > 9_223_372_036_854_775_807n) return null;

  return `${BigInt(whole).toString()}.${padded}`;
}
