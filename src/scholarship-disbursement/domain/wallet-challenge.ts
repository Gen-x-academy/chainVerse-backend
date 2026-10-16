import { createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Domain tag that opens every wallet-ownership message. It binds a signature
 * to this purpose so it cannot be replayed as a login, a transaction, or a
 * challenge from another service that happens to sign free-form text.
 */
export const WALLET_CHALLENGE_DOMAIN =
  'chainverse:scholarship-payout-wallet-verification:v1';

/** SEP-53 prefix used by wallets (e.g. Freighter `signMessage`). */
const SEP53_PREFIX = 'Stellar Signed Message:\n';

export interface WalletChallengeFields {
  challengeId: string;
  network: string;
  organizationId: string;
  recipientId: string;
  address: string;
  nonce: string;
  expiresAt: Date;
}

/**
 * The exact text the recipient signs. Every field that scopes the proof is
 * included, so a signature for one organization, recipient, address, network
 * or challenge is useless for any other.
 */
export function buildWalletChallengeMessage(f: WalletChallengeFields): string {
  return [
    WALLET_CHALLENGE_DOMAIN,
    `network:${f.network}`,
    `organization:${f.organizationId}`,
    `recipient:${f.recipientId}`,
    `address:${f.address}`,
    `challenge:${f.challengeId}`,
    `nonce:${f.nonce}`,
    `expires:${f.expiresAt.toISOString()}`,
  ].join('\n');
}

/**
 * Verifies a SEP-53 signature: ed25519 over SHA-256("Stellar Signed
 * Message:\n" + message). Accepts base64 or hex signature encodings.
 */
export function verifyWalletSignature(
  address: string,
  message: string,
  signature: string,
): boolean {
  const bytes = decodeSignature(signature);
  if (!bytes || bytes.length !== 64) return false;

  const digest = createHash('sha256')
    .update(Buffer.concat([Buffer.from(SEP53_PREFIX), Buffer.from(message)]))
    .digest();

  try {
    return Keypair.fromPublicKey(address).verify(digest, bytes);
  } catch {
    return false;
  }
}

function decodeSignature(signature: string): Buffer | null {
  const trimmed = signature.trim();
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'base64');
  }
  return null;
}
