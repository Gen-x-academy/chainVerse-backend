import { Module } from '@nestjs/common';
import { TracingService } from './tracing.service';

/**
 * Provides the TracingService for instrumenting calls to external services.
 *
 * Import this module wherever you need to start tracing spans (payment
 * gateways, email providers, external APIs, etc.).
 */
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
