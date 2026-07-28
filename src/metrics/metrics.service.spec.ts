import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { register } from './prom-client';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    register.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record http request metrics', async () => {
    service.record({
      method: 'GET',
      path: '/test',
      statusCode: 200,
      durationMs: 100,
    });

    const metrics = await service.prometheusText();
    expect(metrics).toContain(
      'chainverse_http_requests_total{method="GET",route="/test",status_code="200"} 1',
    );
    expect(metrics).toContain(
      'chainverse_http_request_duration_seconds_bucket{le="0.1",method="GET",route="/test",status_code="200"} 1',
    );
  });

  it('should record external call metrics', async () => {
    service.recordExternalCall({
      service: 'test-service',
      method: 'POST',
      statusCode: 201,
      durationMs: 500,
    });

    const metrics = await service.prometheusText();
    expect(metrics).toContain(
      'chainverse_external_call_duration_seconds_bucket{le="0.5",service="test-service",method="POST",status_code="201"} 1',
    );
  });
});
