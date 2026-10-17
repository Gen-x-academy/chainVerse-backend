import { ProfilingService } from './profiling.service';

jest.mock('inspector', () => ({
  Session: jest.fn().mockImplementation(() => {
    throw new Error('inspector unavailable');
  }),
}));

describe('ProfilingService', () => {
  let service: ProfilingService;

  beforeEach(() => {
    service = new ProfilingService();
  });

  it('returns a failure when no CPU profiling is running', async () => {
    await expect(service.stopCpuProfiling()).resolves.toEqual({
      success: false,
      filename: '',
      message: 'No CPU profiling is currently running',
    });
  });

  it('refuses to start a second CPU profile', async () => {
    (service as any).isProfiling = true;

    await expect(service.startCpuProfiling()).resolves.toEqual({
      success: false,
      message: 'CPU profiling is already running',
    });
  });

  it('reports a failure when the inspector session cannot start', async () => {
    const result = await service.startCpuProfiling();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to start CPU profiling');
  });

  it('reports a failure when a heap snapshot cannot be taken', async () => {
    const result = await service.takeHeapSnapshot();

    expect(result).toEqual({
      success: false,
      filename: '',
      message: 'Failed to take heap snapshot: inspector unavailable',
    });
  });

  it('lists available profile files', () => {
    expect(Array.isArray(service.getAvailableProfiles())).toBe(true);
  });

  it('reports memory health with recommendations', () => {
    const health = service.checkMemoryHealth();

    expect(['healthy', 'warning', 'critical']).toContain(health.status);
    expect(health.memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(health.recommendations.length).toBeGreaterThan(0);
  });
});
