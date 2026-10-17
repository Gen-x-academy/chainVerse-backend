import { Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

/** Emits low-cardinality, privacy-safe events; never records addresses, links, or notes. */
@Injectable()
export class MentorshipTelemetryService {
  record(event: string, attributes: Record<string, string | number | boolean>): void {
    const span = trace.getActiveSpan();
    span?.addEvent(`mentorship.${event}`, attributes);
  }
}
