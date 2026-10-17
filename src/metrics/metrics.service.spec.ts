import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('records request counters by status code', () => {
    service.record({
      method: 'GET',
      path: '/courses',
      statusCode: 200,
      durationMs: 10,
    });
    service.record({
      method: 'GET',
      path: '/courses',
      statusCode: 500,
      durationMs: 30,
    });

    const snapshot = service.snapshot() as any;

    expect(snapshot.routes['GET /courses'].requests).toEqual({
      total: 2,
      byStatus: { 200: 1, 500: 1 },
    });
    expect(snapshot.routes['GET /courses'].latency.count).toBe(2);
    expect(snapshot.routes['GET /courses'].latency.avgMs).toBe(20);
  });

  it('calculates latency percentiles', () => {
    for (const durationMs of [10, 20, 30]) {
      service.record({
        method: 'GET',
        path: '/courses',
        statusCode: 200,
        durationMs,
      });
    }

    const snapshot = service.snapshot() as any;

    expect(snapshot.routes['GET /courses'].latency).toMatchObject({
      p50Ms: 20,
      p95Ms: 30,
      p99Ms: 30,
    });
  });

  it('returns an empty snapshot before any requests', () => {
    const snapshot = service.snapshot() as any;

    expect(snapshot.routes).toEqual({});
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('renders Prometheus text output for recorded routes', () => {
    service.record({
      method: 'GET',
      path: '/courses',
      statusCode: 200,
      durationMs: 15,
    });

    const text = service.prometheusText();

    expect(text).toContain(
      'chainverse_http_requests_total{route="GET /courses"} 1',
    );
    expect(text).toContain('quantile="0.95"');
    expect(text).toContain('chainverse_http_request_duration_ms_count');
  });
});
