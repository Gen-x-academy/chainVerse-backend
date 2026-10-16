import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export const AUTOMATION_TOKEN_HEADER = 'x-automation-token';
export const AUTOMATION_KEY_ID_HEADER = 'x-automation-key-id';
export const AUTOMATION_TIMESTAMP_HEADER = 'x-automation-timestamp';
export const AUTOMATION_NONCE_HEADER = 'x-automation-nonce';
export const AUTOMATION_SIGNATURE_HEADER = 'x-automation-signature';

export interface AutomationCredential {
  id: string;
  secret: string;
  scopes?: string[];
  expiresAt?: string | number | Date;
}

export interface AutomationPrincipal {
  sub: string;
  role: 'automation';
  keyId: string;
  scopes: string[];
  authenticatedAt: Date;
}

/**
 * Admits only automation holding valid scholarship credentials.
 * Supports:
 * - Versioned credential IDs (overlap-based rotation without downtime)
 * - Request timestamp and nonce replay protection
 * - Constant-time verification
 * - Granular automation scopes
 * - Secure logging that logs credential ID without leaking secrets
 */
@Injectable()
export class AutomationTokenGuard implements CanActivate {
  private readonly logger = new Logger(AutomationTokenGuard.name);

  // In-memory nonce cache with TTL for replay protection
  private static readonly nonceCache = new Map<string, number>();
  private static readonly MAX_NONCE_CACHE_SIZE = 10000;
  private static readonly CLOCK_SKEW_WINDOW_MS = 300_000; // 5 minutes

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
      url?: string;
      user?: unknown;
    }>();

    const headers = request.headers ?? {};
    const presentedToken = headers[AUTOMATION_TOKEN_HEADER];
    const presentedKeyId = headers[AUTOMATION_KEY_ID_HEADER];
    const presentedTimestamp = headers[AUTOMATION_TIMESTAMP_HEADER];
    const presentedNonce = headers[AUTOMATION_NONCE_HEADER];
    const presentedSignature = headers[AUTOMATION_SIGNATURE_HEADER];

    // 1. Resolve configured credentials
    const credentials = this.resolveConfiguredCredentials();
    if (credentials.length === 0) {
      this.logger.warn('No scholarship automation credentials configured; rejecting all requests');
      throw new AuthException(
        'Valid automation credentials are required',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    // 2. Validate replay protection if timestamp/nonce headers are provided
    if (presentedTimestamp !== undefined || presentedNonce !== undefined) {
      this.validateReplayControls(presentedTimestamp, presentedNonce);
    }

    // 3. Match against active credentials
    const matchedCredential = this.findMatchingCredential(
      credentials,
      presentedToken,
      presentedKeyId,
      presentedTimestamp,
      presentedNonce,
      presentedSignature,
      request.url ?? '',
    );

    if (!matchedCredential) {
      this.logger.warn(
        `Failed automation authentication attempt (keyId: ${
          typeof presentedKeyId === 'string' ? presentedKeyId : 'unknown'
        })`,
      );
      throw new AuthException(
        'Valid automation credentials are required',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    // 4. Attach scoped principal
    const principal: AutomationPrincipal = {
      sub: 'scholarship-automation',
      role: 'automation',
      keyId: matchedCredential.id,
      scopes: matchedCredential.scopes ?? ['disbursements:*'],
      authenticatedAt: new Date(),
    };

    request.user = principal;
    this.logger.log(`Automation request authenticated successfully using credential [${matchedCredential.id}]`);
    return true;
  }

  private resolveConfiguredCredentials(): AutomationCredential[] {
    const rawList = this.config.get<AutomationCredential[] | string>(
      'scholarships.automationTokens',
    );
    const legacyToken = this.config.get<string>('scholarships.automationToken');

    const result: AutomationCredential[] = [];

    if (Array.isArray(rawList)) {
      result.push(...rawList);
    } else if (typeof rawList === 'string' && rawList.trim()) {
      try {
        const parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) {
          result.push(...parsed);
        }
      } catch {
        // Fall back to treating as single token
      }
    }

    // Include legacy token if configured and not already present
    if (legacyToken && !result.some((c) => c.secret === legacyToken)) {
      result.push({
        id: 'legacy-default',
        secret: legacyToken,
        scopes: ['disbursements:*'],
      });
    }

    // Filter out expired credentials
    const now = Date.now();
    return result.filter((cred) => {
      if (!cred.expiresAt) return true;
      const expTime = new Date(cred.expiresAt).getTime();
      return isNaN(expTime) || expTime > now;
    });
  }

  private validateReplayControls(timestampRaw: unknown, nonceRaw: unknown): void {
    if (typeof timestampRaw !== 'string' && typeof timestampRaw !== 'number') {
      throw new AuthException(
        'Valid request timestamp required for replay verification',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    if (typeof nonceRaw !== 'string' || !nonceRaw.trim()) {
      throw new AuthException(
        'Valid nonce required for replay verification',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    const timestamp = Number(timestampRaw);
    if (isNaN(timestamp)) {
      throw new AuthException(
        'Invalid timestamp format',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    const now = Date.now();
    const age = Math.abs(now - timestamp);
    if (age > AutomationTokenGuard.CLOCK_SKEW_WINDOW_MS) {
      throw new AuthException(
        'Request timestamp outside acceptable clock-drift window',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    // Check nonce cache
    const nonceKey = `${timestamp}:${nonceRaw}`;
    if (AutomationTokenGuard.nonceCache.has(nonceKey)) {
      throw new AuthException(
        'Detected duplicate or replayed automation request',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    // Evict expired entries if cache grows large
    if (AutomationTokenGuard.nonceCache.size >= AutomationTokenGuard.MAX_NONCE_CACHE_SIZE) {
      const cutoff = now - AutomationTokenGuard.CLOCK_SKEW_WINDOW_MS;
      for (const [key, time] of AutomationTokenGuard.nonceCache.entries()) {
        if (time < cutoff) {
          AutomationTokenGuard.nonceCache.delete(key);
        }
      }
    }

    AutomationTokenGuard.nonceCache.set(nonceKey, now);
  }

  private findMatchingCredential(
    credentials: AutomationCredential[],
    tokenRaw: unknown,
    keyIdRaw: unknown,
    timestampRaw: unknown,
    nonceRaw: unknown,
    signatureRaw: unknown,
    url: string,
  ): AutomationCredential | null {
    // Mode A: Signature-based authentication
    if (
      typeof signatureRaw === 'string' &&
      typeof keyIdRaw === 'string' &&
      timestampRaw !== undefined &&
      nonceRaw !== undefined
    ) {
      const candidate = credentials.find((c) => c.id === keyIdRaw);
      if (!candidate) return null;

      const payload = `${timestampRaw}:${nonceRaw}:${url}`;
      const expectedHmac = createHmac('sha256', candidate.secret)
        .update(payload)
        .digest('hex');

      if (constantTimeEquals(signatureRaw, expectedHmac)) {
        return candidate;
      }
      return null;
    }

    // Mode B: Direct token-based verification
    if (typeof tokenRaw === 'string' && tokenRaw.trim()) {
      // If keyId is specified, check that specific credential first
      if (typeof keyIdRaw === 'string') {
        const candidate = credentials.find((c) => c.id === keyIdRaw);
        if (candidate && constantTimeEquals(tokenRaw, candidate.secret)) {
          return candidate;
        }
        return null;
      }

      // Check all active credentials in rotation
      for (const cred of credentials) {
        if (constantTimeEquals(tokenRaw, cred.secret)) {
          return cred;
        }
      }
    }

    return null;
  }
}

/** Hash both sides so length differences do not leak through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
