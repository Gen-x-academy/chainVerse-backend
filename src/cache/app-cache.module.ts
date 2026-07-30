import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const ttl = parseInt(process.env.CACHE_TTL_MS ?? '300000', 10);
        const max = parseInt(process.env.CACHE_MAX_ITEMS ?? '1000', 10);
        return { ttl, max };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
