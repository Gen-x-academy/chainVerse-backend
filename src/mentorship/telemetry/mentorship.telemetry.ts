import { Injectable, Logger } from '@nestjs/common';
import { metrics, Counter } from '@opentelemetry/api';

/**
 * Operational telemetry for the mentorship application workflow.
 *
 * Counters go through the OpenTelemetry API, which is a no-op until a meter
 * provider is registered, so this costs nothing where metrics export is not
 * configured. Structured log lines carry the same attributes for log-based
 * dashboards. Attributes are identifiers and enums only — never applicant
 * free text or internal notes.
 */
@Injectable()
export class MentorshipTelemetry {
  private readonly logger = new Logger('Mentorship');
  private readonly meter = metrics.getMeter('chainverse.mentorship');

  private readonly decisions: Counter = this.meter.createCounter(
    'mentorship_application_decisions_total',
    { description: 'Decisions recorded on mentorship applications' },
  );
  private readonly replays: Counter = this.meter.createCounter(
    'mentorship_idempotent_replays_total',
    { description: 'Requests answered from an earlier identical request' },
  );
  private readonly rejections: Counter = this.meter.createCounter(
    'mentorship_request_rejections_total',
    { description: 'Requests refused by a business rule, keyed by error code' },
  );
  private readonly seatReleases: Counter = this.meter.createCounter(
    'mentorship_seat_releases_total',
    { description: 'Seat reservations released by withdrawal' },
  );
  private readonly reapplications: Counter = this.meter.createCounter(
    'mentorship_reapplications_total',
    { description: 'Reapplications created' },
  );
  private readonly notifications: Counter = this.meter.createCounter(
    'mentorship_decision_notifications_total',
    { description: 'Decision notifications processed by the dispatcher' },
  );

  decisionRecorded(attrs: {
    applicationId: string;
    decisionId: string;
    type: string;
    fromStatus: string;
    toStatus: string;
    actorKind: string;
  }): void {
    this.decisions.add(1, {
      type: attrs.type,
      from_status: attrs.fromStatus,
      to_status: attrs.toStatus,
      actor_kind: attrs.actorKind,
    });
    this.logger.log({ event: 'mentorship.decision.recorded', ...attrs });
  }

  idempotentReplay(operation: string, resourceId: string): void {
    this.replays.add(1, { operation });
    this.logger.log({
      event: 'mentorship.idempotent_replay',
      operation,
      resourceId,
    });
  }

  requestRejected(
    operation: string,
    errorCode: string,
    resourceId?: string,
  ): void {
    this.rejections.add(1, { operation, error_code: errorCode });
    this.logger.warn({
      event: 'mentorship.request.rejected',
      operation,
      errorCode,
      resourceId,
    });
  }

  seatReleased(programId: string, applicationId: string): void {
    this.seatReleases.add(1);
    this.logger.log({
      event: 'mentorship.seat.released',
      programId,
      applicationId,
    });
  }

  reapplied(attrs: {
    applicationId: string;
    previousApplicationId: string;
    attemptNumber: number;
  }): void {
    this.reapplications.add(1);
    this.logger.log({ event: 'mentorship.application.reapplied', ...attrs });
  }

  notificationProcessed(outcome: 'sent' | 'failed', decisionId: string): void {
    this.notifications.add(1, { outcome });
    const line = {
      event: 'mentorship.notification.processed',
      outcome,
      decisionId,
    };
    if (outcome === 'failed') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
