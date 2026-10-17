import { Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

/** Emits low-cardinality, privacy-safe events; never records addresses, links, or notes. */
@Injectable()
export class MentorshipTelemetryService {
  record(event: string, attributes: Record<string, string | number | boolean>): void {
    const span = trace.getActiveSpan();
    span?.addEvent(`mentorship.${event}`, attributes);
import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { MentorshipException } from './mentorship.errors';

/**
 * Counters (exposed on /metrics and /metrics/prometheus) and structured logs
 * for the matching workflow. Labels are deliberately low-cardinality — user
 * and proposal ids go to logs only, never to metric labels.
 */
@Injectable()
export class MentorshipTelemetry {
  private readonly logger = new Logger('Mentorship');

  constructor(private readonly metrics: MetricsService) {}

  proposalEvent(
    event: string,
    labels: Record<string, string>,
    context: Record<string, unknown>,
  ): void {
    this.metrics.increment('mentorship_proposal_events_total', {
      event,
      ...labels,
    });
    this.logger.log({ msg: `proposal.${event}`, ...labels, ...context });
  }

  overrideApplied(check: string, context: Record<string, unknown>): void {
    this.metrics.increment('mentorship_overrides_total', { check });
    this.logger.warn({ msg: 'override.applied', check, ...context });
  }

  activation(outcome: string, context: Record<string, unknown>): void {
    this.metrics.increment('mentorship_activations_total', { outcome });
    this.logger.log({ msg: `activation.${outcome}`, ...context });
  }

  sweep(phase: string, count: number): void {
    if (count === 0) return;
    this.metrics.increment('mentorship_sweep_runs_total', { phase });
    this.logger.log({ msg: `sweep.${phase}`, count });
  }

  capacityDrift(context: Record<string, unknown>): void {
    this.metrics.increment('mentorship_capacity_drift_total');
    this.logger.warn({ msg: 'capacity.drift_corrected', ...context });
  }

  /** Counts a rejected request by its stable error code and returns the error. */
  fail<E extends MentorshipException>(error: E): E {
    this.metrics.increment('mentorship_request_failures_total', {
      code: error.errorCode,
    });
    return error;
  }
}
