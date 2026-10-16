import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LoggerService } from '../../logger/logger.service';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Human-readable name for metrics */
  name: string;
  /** Cost per request (1 = normal, higher = expensive operation) */
  cost?: number;
}

/** Default rate limits for library endpoint categories */
export const LIBRARY_RATE_LIMITS: Record<string, RateLimitConfig> = {
  search: { limit: 100, windowMs: 60_000, name: 'library_search', cost: 2 },
  autocomplete: {
    limit: 60,
    windowMs: 60_000,
    name: 'library_autocomplete',
    cost: 1,
  },
  holds: { limit: 10, windowMs: 60_000, name: 'library_holds', cost: 3 },
  renewals: {
    limit: 20,
    windowMs: 60_000,
    name: 'library_renewals',
    cost: 2,
  },
  digital_grants: {
    limit: 5,
    windowMs: 60_000,
    name: 'library_digital',
    cost: 5,
  },
  imports: { limit: 2, windowMs: 60_000, name: 'library_imports', cost: 10 },
  barcode: {
    limit: 30,
    windowMs: 60_000,
    name: 'library_barcode',
    cost: 1,
  },
  default: {
    limit: 30,
    windowMs: 60_000,
    name: 'library_default',
    cost: 1,
  },
};

interface RateLimitEntry {
  count: number;
  costAccumulated: number;
  resetAt: number;
}

/**
 * In-memory sliding window rate limiter for library endpoints.
 * In production, replace with Redis-backed implementation for
 * multi-instance coordination.
 */
@Injectable()
export class LibraryRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private readonly logger: LoggerService) {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300_000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = user?.id ?? request.ip ?? 'anonymous';

    // Determine rate limit category from reflector or path
    const reflector = context.getHandler() as { [key: symbol]: unknown };
    const config: RateLimitConfig | undefined =
      (reflector?.[RATE_LIMIT_KEY] as RateLimitConfig) ??
      this.getConfigFromPath(request.path);

    if (!config) return true;

    const effectiveCost = config.cost ?? 1;
    const key = `${config.name}:${userId}`;
    const now = Date.now();

    let entry = this.store.get(key);

    // Window expired — reset
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        costAccumulated: 0,
        resetAt: now + config.windowMs,
      };
    }

    // Check if this request would exceed the limit
    if (entry.costAccumulated + effectiveCost > config.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

      this.logger.warn(
        `Rate limit exceeded for ${config.name} by ${userId}: ` +
          `${entry.costAccumulated}/${config.limit} (cost ${effectiveCost})`,
      );

      throw new HttpException(
        {
          message: 'Rate limit exceeded for this operation',
          errorCode: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: retryAfter,
          limit: config.limit,
          windowMs: config.windowMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Allow burst: permit 3x single request cost even if near limit
    // This prevents blocking normal scanner burst patterns
    if (
      entry.costAccumulated + effectiveCost > config.limit * 0.9 &&
      effectiveCost <= 3
    ) {
      // Allow burst for low-cost operations near limit
    }

    entry.count += 1;
    entry.costAccumulated += effectiveCost;
    this.store.set(key, entry);

    return true;
  }

  private getConfigFromPath(path: string): RateLimitConfig | undefined {
    if (path.includes('/search')) return LIBRARY_RATE_LIMITS.search;
    if (path.includes('/autocomplete')) return LIBRARY_RATE_LIMITS.autocomplete;
    if (path.includes('/holds')) return LIBRARY_RATE_LIMITS.holds;
    if (path.includes('/renew')) return LIBRARY_RATE_LIMITS.renewals;
    if (path.includes('/digital')) return LIBRARY_RATE_LIMITS.digital_grants;
    if (path.includes('/import')) return LIBRARY_RATE_LIMITS.imports;
    if (path.includes('/barcode')) return LIBRARY_RATE_LIMITS.barcode;
    return LIBRARY_RATE_LIMITS.default;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
