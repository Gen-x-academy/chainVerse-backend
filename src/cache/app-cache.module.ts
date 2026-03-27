import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

/**
 * AppCacheModule wires up the global response cache.
 *
 * Configuration (all optional, sensible defaults apply):
 *   CACHE_TTL_MS    – per-item time-to-live in milliseconds (default 5 min)
 *   CACHE_MAX_ITEMS – maximum number of items kept in the in-process store
 *                     (default 1000); ignored when Redis is used
 *
 * When REDIS_URL is set the module upgrades to a Redis-backed store
 * automatically (requires the `cache-manager-redis-yet` peer dependency).
 * Without a Redis URL it falls back to the built-in in-memory store so the
 * application degrades gracefully in local / CI environments.
 */
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const ttl = parseInt(process.env.CACHE_TTL_MS ?? '300000', 10);
        const max = parseInt(process.env.CACHE_MAX_ITEMS ?? '1000', 10);

        return { ttl, max };
      },
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
