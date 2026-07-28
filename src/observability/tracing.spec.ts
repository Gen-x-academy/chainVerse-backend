import { startTracing, shutdownTracing, createSpan } from './tracing';
import { trace, SpanStatusCode } from '@opentelemetry/api';

describe('Tracing', () => {
  afterEach(async () => {
    await shutdownTracing();
  });

  it('should start and shutdown tracing', async () => {
    const startSpy = jest.spyOn(console, 'log');
    await startTracing();
    expect(startSpy).toHaveBeenCalledWith('OpenTelemetry tracing initialized');

    const shutdownSpy = jest.spyOn(console, 'log');
    await shutdownTracing();
    expect(shutdownSpy).toHaveBeenCalledWith('OpenTelemetry tracing shut down');
  });

  it('should create a span', async () => {
    await startTracing();
    const tracer = trace.getTracer('chainverse-api', '1.0.0');
    const endSpanSpy = jest.spyOn(tracer.getDelegate(), 'startSpan');

    await createSpan('test-span', async (span) => {
      expect(span).toBeDefined();
    });

    expect(endSpanSpy).toHaveBeenCalled();
  });

  it('should handle errors in a span', async () => {
    await startTracing();
    const tracer = trace.getTracer('chainverse-api', '1.0.0');
    const setStatusSpy = jest.spyOn(tracer.getDelegate(), 'startSpan');

    await expect(
      createSpan('test-span-error', async () => {
        throw new Error('test-error');
      }),
    ).rejects.toThrow('test-error');
  });
});
