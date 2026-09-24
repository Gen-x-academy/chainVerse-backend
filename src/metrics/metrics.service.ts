import { Injectable } from '@nestjs/common';

export interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

interface Counter {
  total: number;
  byStatus: Record<number, number>;
}

interface Histogram {
  count: number;
  sum: number;
  /** Sorted list of observed durations in ms (kept for percentile calculation). */
  values: number[];
}

/**
 * In-memory metrics store.
 *
 * Tracks:
 * - Request counters per route (method + path)
 * - Response latency histograms per route
 * - Application start time (uptime)
 *
 * All data lives in memory and resets on process restart. For production use,
 * swap the in-memory store for a time-series database or push the metrics to
 * an external aggregator (e.g. Prometheus push-gateway, Datadog, etc.).
 */
@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  /** Called by MetricsInterceptor after every request. */
  record(metric: RequestMetric): void {
    const label = `${metric.method} ${metric.path}`;
    this.incrementCounter(label, metric.statusCode);
    this.observeLatency(label, metric.durationMs);
  }

  /** Returns a snapshot of all collected metrics. */
  snapshot(): Record<string, unknown> {
    const routes: Record<string, unknown> = {};

    for (const [label, counter] of this.counters.entries()) {
      const histogram = this.histograms.get(label);
      routes[label] = {
        requests: {
          total: counter.total,
          byStatus: counter.byStatus,
        },
        latency: histogram
          ? {
              count: histogram.count,
              sumMs: histogram.sum,
              avgMs: histogram.count
                ? +(histogram.sum / histogram.count).toFixed(2)
                : 0,
              p50Ms: this.percentile(histogram.values, 50),
              p95Ms: this.percentile(histogram.values, 95),
              p99Ms: this.percentile(histogram.values, 99),
            }
          : null,
      };
    }

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      collectedAt: new Date().toISOString(),
      routes,
    };
  }

  /** Returns a Prometheus-compatible text exposition of the metrics. */
  prometheusText(): string {
    const lines: string[] = [
      `# HELP chainverse_uptime_seconds Application uptime in seconds`,
      `# TYPE chainverse_uptime_seconds gauge`,
      `chainverse_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`,
      '',
    ];

    for (const [label, counter] of this.counters.entries()) {
      const escapedLabel = label.replace(/"/g, '\\"');
      lines.push(
        `# HELP chainverse_http_requests_total Total HTTP requests`,
        `# TYPE chainverse_http_requests_total counter`,
        `chainverse_http_requests_total{route="${escapedLabel}"} ${counter.total}`,
      );

      for (const [status, count] of Object.entries(counter.byStatus)) {
        lines.push(
          `chainverse_http_requests_total{route="${escapedLabel}",status="${status}"} ${count}`,
        );
      }
      lines.push('');

      const histogram = this.histograms.get(label);
      if (histogram) {
        lines.push(
          `# HELP chainverse_http_request_duration_ms HTTP request duration in milliseconds`,
          `# TYPE chainverse_http_request_duration_ms summary`,
          `chainverse_http_request_duration_ms{route="${escapedLabel}",quantile="0.5"} ${this.percentile(histogram.values, 50)}`,
          `chainverse_http_request_duration_ms{route="${escapedLabel}",quantile="0.95"} ${this.percentile(histogram.values, 95)}`,
          `chainverse_http_request_duration_ms{route="${escapedLabel}",quantile="0.99"} ${this.percentile(histogram.values, 99)}`,
          `chainverse_http_request_duration_ms_sum{route="${escapedLabel}"} ${histogram.sum}`,
          `chainverse_http_request_duration_ms_count{route="${escapedLabel}"} ${histogram.count}`,
          '',
        );
      }
    }

    return lines.join('\n');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private incrementCounter(label: string, statusCode: number): void {
    if (!this.counters.has(label)) {
      this.counters.set(label, { total: 0, byStatus: {} });
    }
    const counter = this.counters.get(label)!;
    counter.total += 1;
    counter.byStatus[statusCode] = (counter.byStatus[statusCode] ?? 0) + 1;
  }

  private observeLatency(label: string, durationMs: number): void {
    if (!this.histograms.has(label)) {
      this.histograms.set(label, { count: 0, sum: 0, values: [] });
    }
    const histogram = this.histograms.get(label)!;
    histogram.count += 1;
    histogram.sum += durationMs;
    // Keep at most 1000 samples per route to bound memory usage.
    if (histogram.values.length >= 1000) {
      histogram.values.shift();
    }
    histogram.values.push(durationMs);
    histogram.values.sort((a, b) => a - b);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return +sorted[Math.max(0, idx)].toFixed(2);
  }
}
