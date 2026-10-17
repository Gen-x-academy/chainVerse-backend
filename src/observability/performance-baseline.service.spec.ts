import { PerformanceBaselineService } from './performance-baseline.service';

describe('PerformanceBaselineService', () => {
  let service: PerformanceBaselineService;

  beforeAll(() => {
    service = new PerformanceBaselineService();
  });

  beforeEach(() => {
    service.resetBaselines();
  });

  it('initialises a baseline from the first sample', () => {
    service.recordRequestDuration('/courses', 'GET', 0.2);

    const [baseline] = service.getBaselines();

    expect(baseline).toMatchObject({
      route: '/courses',
      method: 'GET',
      p50: 0.2,
      p95: 0.2,
      p99: 0.2,
      sampleCount: 1,
    });
  });

  it('updates the baseline with an exponential moving average', () => {
    service.recordRequestDuration('/courses', 'GET', 0.2);
    service.recordRequestDuration('/courses', 'GET', 1.2);

    const [baseline] = service.getBaselines();

    expect(baseline.sampleCount).toBe(2);
    expect(baseline.p95).toBeCloseTo(0.3);
  });

  it('records a regression when a request is much slower than the baseline', () => {
    service.recordRequestDuration('/courses', 'GET', 1);
    service.recordRequestDuration('/courses', 'GET', 2);

    const regressions = service.getRegressions();

    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({
      route: '/courses',
      method: 'GET',
      currentDuration: 2,
      baselineP95: 1,
      percentageIncrease: 100,
    });
  });

  it('cleans up regressions older than 24 hours', () => {
    service.recordRequestDuration('/courses', 'GET', 1);
    service.recordRequestDuration('/courses', 'GET', 2);

    (service as any).regressions[0].detectedAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    );

    service.cleanupOldRegressions();

    expect(service.getRegressions()).toHaveLength(0);
  });

  it('resets baselines and regressions', () => {
    service.recordRequestDuration('/courses', 'GET', 1);
    service.recordRequestDuration('/courses', 'GET', 2);

    service.resetBaselines();

    expect(service.getBaselines()).toHaveLength(0);
    expect(service.getRegressions()).toHaveLength(0);
  });
});
