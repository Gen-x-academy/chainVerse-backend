import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * Thin wrapper over MetricsService + structured logs for mentorship flows.
 *
 * Label values must stay low-cardinality (action, outcome, reason). Never
 * pass user ids, application ids or free text as labels – put those in the
 * structured log line instead.
 */
@Injectable()
export class MentorshipTelemetry {
  private readonly logger = new Logger('Mentorship');

  constructor(private readonly metrics: MetricsService) {}

  count(name: string, labels: Record<string, string> = {}, by = 1): void {
    this.metrics.increment(name, labels, by);
  }

  event(event: string, fields: Record<string, unknown>): void {
    this.logger.log({ event, ...fields });
  }

  warn(event: string, fields: Record<string, unknown>): void {
    this.logger.warn({ event, ...fields });
  }
}
