import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * Builds ThrottlerModule options from AppConfig so the global rate-limiter
 * respects the per-role limits defined in the environment instead of the
 * previous hardcoded ttl=60 / limit=10 values. Closes #401.
 */
export function buildThrottlerOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  const rl = config.get('rateLimit') as {
    enabled: boolean;
    guest: { windowMs: number; max: number };
    auth: { windowMs: number; max: number };
    premium: { windowMs: number; max: number };
    admin: { windowMs: number; max: number };
  };

  const redisUrl = config.get<string>('redis.url');

  return {
    throttlers: [
      { name: 'guest', ttl: rl.guest.windowMs, limit: rl.guest.max },
      { name: 'auth', ttl: rl.auth.windowMs, limit: rl.auth.max },
      { name: 'premium', ttl: rl.premium.windowMs, limit: rl.premium.max },
      { name: 'admin', ttl: rl.admin.windowMs, limit: rl.admin.max },
    ],
    ...(redisUrl && {
      storage: new ThrottlerStorageRedisService(redisUrl),
    }),
  };
}
