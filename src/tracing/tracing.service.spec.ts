import { TracingService } from './tracing.service';

describe('TracingService', () => {
  let service: TracingService;
  let loggerLog: jest.SpyInstance;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    service = new TracingService();
    loggerLog = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);
    loggerError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts a span with generated ids, start time and attributes', () => {
    const span = service.startSpan('stripe.charge', { amount: 10 });

    expect(span.name).toBe('stripe.charge');
    expect(span.traceId).toHaveLength(16);
    expect(span.spanId).toHaveLength(16);
    expect(span.attributes).toEqual({ amount: 10 });
    expect(span.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it('logs structured data when a span finishes', () => {
    const span = service.startSpan('db.query', { table: 'users' });

    span.finish({ rows: 2 });

    expect(loggerLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'span.finish',
        name: 'db.query',
        attributes: { table: 'users', rows: 2 },
      }),
    );
  });

  it('logs the error when a span fails', () => {
    const span = service.startSpan('db.query');

    span.error(new Error('boom'));

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'span.error',
        name: 'db.query',
        errorMessage: 'boom',
      }),
      expect.any(String),
    );
  });

  it('finishes the span and returns the traced result', async () => {
    const finish = jest.fn();
    const error = jest.fn();
    jest.spyOn(service, 'startSpan').mockReturnValue({
      traceId: 'trace-1',
      spanId: 'span-1',
      name: 'operation',
      startedAt: Date.now(),
      attributes: {},
      finish,
      error,
    });

    await expect(service.trace('operation', async () => 42)).resolves.toBe(42);
    expect(finish).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('marks the span as errored and rethrows the failure', async () => {
    const finish = jest.fn();
    const error = jest.fn();
    jest.spyOn(service, 'startSpan').mockReturnValue({
      traceId: 'trace-1',
      spanId: 'span-1',
      name: 'operation',
      startedAt: Date.now(),
      attributes: {},
      finish,
      error,
    });

    await expect(
      service.trace('operation', async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');

    expect(error).toHaveBeenCalledWith(expect.any(Error));
    expect(finish).not.toHaveBeenCalled();
  });

  it('wraps non-Error failures in an Error before logging', async () => {
    const error = jest.fn();
    jest.spyOn(service, 'startSpan').mockReturnValue({
      traceId: 'trace-1',
      spanId: 'span-1',
      name: 'operation',
      startedAt: Date.now(),
      attributes: {},
      finish: jest.fn(),
      error,
    });

    await expect(
      service.trace('operation', async () => {
        throw 'plain string';
      }),
    ).rejects.toBe('plain string');

    expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
