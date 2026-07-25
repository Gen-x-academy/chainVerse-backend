import { Injectable, Logger } from '@nestjs/common';
import { register, Histogram, Gauge } from 'prom-client';

interface BaselineMetric {
  route: string;
  method: string;
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
  lastUpdated: Date;
}

interface RegressionDetection {
  route: string;
  method: string;
  currentDuration: number;
  baselineP95: number;
  percentageIncrease: number;
  detectedAt: Date;
}

@Injectable()
export class PerformanceBaselineService {
  private readonly logger = new Logger(PerformanceBaselineService.name);
  private baselines: Map<string, BaselineMetric> = new Map();
  private regressions: RegressionDetection[] = [];
  
  // Prometheus metrics for baseline tracking
  private readonly baselineP50Gauge: Gauge;
  private readonly baselineP95Gauge: Gauge;
  private readonly baselineP99Gauge: Gauge;
  private readonly regressionCounter: Gauge;
  private readonly requestDurationHistogram: Histogram;

  // Thresholds for regression detection (percentage increase that triggers an alert)
  private readonly regressionThreshold = 50; // 50% slower than baseline P95

  constructor() {
    // Initialize Prometheus gauges
    this.baselineP50Gauge = new Gauge({
      name: 'alian_structure_baseline_p50_seconds',
      help: 'Baseline P50 latency for routes',
      labelNames: ['route', 'method'],
      registers: [register],
    });

    this.baselineP95Gauge = new Gauge({
      name: 'alian_structure_baseline_p95_seconds',
      help: 'Baseline P95 latency for routes',
      labelNames: ['route', 'method'],
      registers: [register],
    });

    this.baselineP99Gauge = new Gauge({
      name: 'alian_structure_baseline_p99_seconds',
      help: 'Baseline P99 latency for routes',
      labelNames: ['route', 'method'],
      registers: [register],
    });

    this.regressionCounter = new Gauge({
      name: 'alian_structure_performance_regressions_total',
      help: 'Total number of detected performance regressions',
      registers: [register],
    });
    this.regressionCounter.set(0);

    this.requestDurationHistogram = new Histogram({
      name: 'alian_structure_request_duration_baseline_seconds',
      help: 'Request duration compared to baseline',
      labelNames: ['route', 'method', 'baseline_status'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [register],
    });
  }

  /**
   * Record a request duration and update baselines
   */
  recordRequestDuration(route: string, method: string, durationSeconds: number) {
    const key = `${method}:${route}`;
    
    // Add to histogram
    let baselineStatus = 'normal';
    const baseline = this.baselines.get(key);
    
    if (baseline) {
      if (durationSeconds > baseline.p95 * (1 + this.regressionThreshold / 100)) {
        baselineStatus = 'regression';
        this.detectRegression(route, method, durationSeconds, baseline.p95);
      } else if (durationSeconds > baseline.p95) {
        baselineStatus = 'slow';
      }
    }

    this.requestDurationHistogram.labels(route, method, baselineStatus).observe(durationSeconds);

    // Update baseline with exponential moving average
    this.updateBaseline(key, route, method, durationSeconds);
  }

  /**
   * Update baseline metrics with new data point
   */
  private updateBaseline(key: string, route: string, method: string, durationSeconds: number) {
    const existing = this.baselines.get(key);
    
    if (!existing) {
      // Initialize baseline with first value
      this.baselines.set(key, {
        route,
        method,
        p50: durationSeconds,
        p95: durationSeconds,
        p99: durationSeconds,
        sampleCount: 1,
        lastUpdated: new Date()
      });
      return;
    }

    // Simple EMA update for baselines (alpha = 0.1 for gradual changes)
    const alpha = 0.1;
    const updated = {
      ...existing,
      p50: existing.p50 * (1 - alpha) + durationSeconds * alpha,
      p95: existing.p95 * (1 - alpha) + durationSeconds * alpha,
      p99: existing.p99 * (1 - alpha) + durationSeconds * alpha,
      sampleCount: existing.sampleCount + 1,
      lastUpdated: new Date()
    };

    this.baselines.set(key, updated);

    // Update Prometheus gauges
    this.baselineP50Gauge.labels(route, method).set(updated.p50);
    this.baselineP95Gauge.labels(route, method).set(updated.p95);
    this.baselineP99Gauge.labels(route, method).set(updated.p99);
  }

  /**
   * Detect performance regressions
   */
  private detectRegression(route: string, method: string, currentDuration: number, baselineP95: number) {
    const percentageIncrease = ((currentDuration - baselineP95) / baselineP95) * 100;
    
    const regression: RegressionDetection = {
      route,
      method,
      currentDuration,
      baselineP95,
      percentageIncrease,
      detectedAt: new Date()
    };

    this.regressions.push(regression);
    this.regressionCounter.set(this.regressions.length);

    // Log the regression as a warning
    this.logger.warn(`⚠️ Performance regression detected for ${method} ${route}: ${percentageIncrease.toFixed(1)}% slower than baseline P95. Current: ${currentDuration.toFixed(3)}s, Baseline: ${baselineP95.toFixed(3)}s`);
  }

  /**
   * Get all baselines
   */
  getBaselines(): BaselineMetric[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Get all detected regressions
   */
  getRegressions(): RegressionDetection[] {
    return [...this.regressions];
  }

  /**
   * Clear old regressions (older than 24h)
   */
  cleanupOldRegressions() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    this.regressions = this.regressions.filter(r => r.detectedAt > oneDayAgo);
    this.regressionCounter.set(this.regressions.length);
  }

  /**
   * Reset all baselines (for testing or after deployment)
   */
  resetBaselines() {
    this.baselines.clear();
    this.regressions = [];
    this.regressionCounter.set(0);
    this.logger.log('Performance baselines have been reset');
  }
}