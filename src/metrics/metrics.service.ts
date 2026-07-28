import { Injectable } from '@nestjs/common';
import {
  register,
  httpRequestDuration,
  httpRequestTotal,
  externalCallDuration,
} from './prom-client';

export interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export interface ExternalCallMetric {
  service: string;
  method: string;
  statusCode: number;
  durationMs: number;
}

@Injectable()
export class MetricsService {
  /** Called by MetricsInterceptor after every request. */
  record(metric: RequestMetric): void {
    const seconds = metric.durationMs / 1000;
    const labels = {
      method: metric.method,
      route: metric.path,
      status_code: metric.statusCode,
    };
    httpRequestDuration.observe(labels, seconds);
    httpRequestTotal.inc(labels);
  }

  recordExternalCall(metric: ExternalCallMetric): void {
    const seconds = metric.durationMs / 1000;
    const labels = {
      service: metric.service,
      method: metric.method,
      status_code: metric.statusCode,
    };
    externalCallDuration.observe(labels, seconds);
  }

  /** Returns a snapshot of all collected metrics. */
  snapshot(): Record<string, unknown> {
    // This method is now deprecated and will be removed.
    return {};
  }

  /** Returns a Prometheus-compatible text exposition of the metrics. */
  prometheusText(): Promise<string> {
    return register.metrics();
  }
}
