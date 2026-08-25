import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class WebhookVerificationService {
  private readonly secret: string;
  private readonly timestampToleranceMs: number;
  private readonly seenNonces: Map<string, number> = new Map();

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('WEBHOOK_SECRET') ?? '';
    this.timestampToleranceMs = this.config.get<number>(
      'WEBHOOK_TIMESTAMP_TOLERANCE_MS',
    ) ?? 5 * 60 * 1000;
  }

  /**
   * Compute HMAC-SHA256 signature for a given payload.
   */
  computeSignature(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /**
   * Verify that the provided signature matches the expected HMAC-SHA256.
   */
  verifySignature(payload: string, signature: string): boolean {
    const expected = this.computeSignature(payload);
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Validate the timestamp header to prevent replay attacks.
   * Returns true if the timestamp is within the acceptable window.
   */
  validateTimestamp(timestampHeader: string): boolean {
    const timestamp = parseInt(timestampHeader, 10);

    if (isNaN(timestamp)) {
      return false;
    }

    const now = Date.now();
    const diff = Math.abs(now - timestamp * 1000);

    return diff <= this.timestampToleranceMs;
  }

  /**
   * Check and record a nonce (timestamp + nonce pair) to prevent replay.
   * Returns true if this is the first time seeing this nonce within its window.
   */
  checkAndRecordNonce(timestamp: string, nonce: string): boolean {
    const key = `${timestamp}:${nonce}`;
    const now = Date.now();

    // Clean up expired entries
    this.cleanupExpiredNonces(now);

    if (this.seenNonces.has(key)) {
      return false;
    }

    // Store with TTL = tolerance window
    this.seenNonces.set(key, now + this.timestampToleranceMs);
    return true;
  }

  /**
   * Full webhook verification: signature + timestamp + nonce.
   */
  verifyWebhook(
    payload: string,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
    nonceHeader: string | undefined,
  ): void {
    if (!this.secret) {
      throw new UnauthorizedException(
        'Webhook secret is not configured',
      );
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing webhook signature header');
    }

    if (!timestampHeader) {
      throw new UnauthorizedException('Missing webhook timestamp header');
    }

    if (!nonceHeader) {
      throw new UnauthorizedException('Missing webhook nonce header');
    }

    // Verify timestamp is recent
    if (!this.validateTimestamp(timestampHeader)) {
      throw new UnauthorizedException(
        'Webhook timestamp is outside the acceptable window',
      );
    }

    // Verify signature: HMAC-SHA256(secret, `${timestamp}.${payload}`)
    const signedContent = `${timestampHeader}.${payload}`;
    if (!this.verifySignature(signedContent, signatureHeader)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Check for replay via nonce
    if (!this.checkAndRecordNonce(timestampHeader, nonceHeader)) {
      throw new UnauthorizedException('Webhook replay detected (duplicate nonce)');
    }
  }

  private cleanupExpiredNonces(now: number): void {
    for (const [key, expiresAt] of this.seenNonces.entries()) {
      if (now > expiresAt) {
        this.seenNonces.delete(key);
      }
    }
  }
}
