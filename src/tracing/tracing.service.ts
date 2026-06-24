import { Injectable, Logger } from '@nestjs/common';

export interface Span {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: number;
  attributes: Record<string, unknown>;
  finish(attributes?: Record<string, unknown>): void;
  error(err: Error): void;
}

/**
 * Lightweight tracing service.
 *
 * Provides hooks for instrumenting calls to external services (HTTP clients,
 * databases, message queues, etc.) without requiring a full distributed-tracing
 * SDK at this stage.
 *
 * Spans are logged as structured JSON so they can be ingested by any log
 * aggregator (Datadog, Grafana Loki, CloudWatch, etc.).  When a proper
 * tracing backend (OpenTelemetry, Jaeger, Zipkin) is adopted, replace the
 * log-emission inside `finish()` / `error()` with the SDK's span API.
 *
 * @example
 * const span = this.tracingService.startSpan('stripe.charge', { amount });
 * try {
 *   const result = await stripe.charges.create(...);
 *   span.finish({ chargeId: result.id });
 * } catch (err) {
 *   span.error(err);
 *   throw err;
 * }
 */
@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);

  /**
   * Starts a new tracing span.
   *
   * @param name       Human-readable operation name (e.g. 'stripe.charge').
   * @param attributes Key-value pairs attached to the span at creation time.
   */
  startSpan(name: string, attributes: Record<string, unknown> = {}): Span {
    const traceId = this.generateId();
    const spanId = this.generateId();
    const startedAt = Date.now();
    const logger = this.logger;

    return {
      traceId,
      spanId,
      name,
      startedAt,
      attributes: { ...attributes },
      finish(endAttributes: Record<string, unknown> = {}): void {
        const durationMs = Date.now() - startedAt;
        logger.log({
          event: 'span.finish',
          traceId,
          spanId,
          name,
          durationMs,
          attributes: { ...attributes, ...endAttributes },
        });
      },
      error(err: Error): void {
        const durationMs = Date.now() - startedAt;
        logger.error(
          {
            event: 'span.error',
            traceId,
            spanId,
            name,
            durationMs,
            errorMessage: err.message,
            attributes,
          },
          err.stack,
        );
      },
    };
  }

  /**
   * Wraps an async operation in a span automatically.
   * The span is finished on success and errored on exception.
   */
  async trace<T>(
    name: string,
    operation: (span: Span) => Promise<T>,
    attributes: Record<string, unknown> = {},
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await operation(span);
      span.finish();
      return result;
    } catch (err) {
      span.error(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2, 18).padEnd(16, '0');
  }
}
