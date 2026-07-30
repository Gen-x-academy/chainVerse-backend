import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

/**
 * Registers the metrics infrastructure globally.
 *
 * - MetricsInterceptor is bound via APP_INTERCEPTOR so every route is
 *   automatically timed and counted without per-controller decoration.
 * - MetricsController exposes /metrics (JSON) and /metrics/prometheus endpoints.
 */
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
