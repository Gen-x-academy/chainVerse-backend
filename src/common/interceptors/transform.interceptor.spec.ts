import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

/** Helper that builds a minimal CallHandler returning the given value. */
function buildCallHandler<T>(value: T) {
  return {
    handle: () => of(value),
  };
}

/** Minimal ExecutionContext stub — TransformInterceptor does not read it. */
const mockContext = {} as ExecutionContext;

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  // ── Shape guarantee ────────────────────────────────────────────────────────

  it('wraps the response in { success, data, timestamp }', (done) => {
    const payload = { id: 1, name: 'Alice' };
    const handler = buildCallHandler(payload);

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result).toMatchObject({
        success: true,
        data: payload,
        timestamp: expect.any(String),
      });
      done();
    });
  });

  it('sets success to true', (done) => {
    const handler = buildCallHandler({ ok: true });

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result.success).toBe(true);
      done();
    });
  });

  it('produces a valid ISO-8601 timestamp', (done) => {
    const handler = buildCallHandler(null);

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      done();
    });
  });

  it('passes null data through unchanged', (done) => {
    const handler = buildCallHandler(null);

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result.data).toBeNull();
      done();
    });
  });

  it('passes an array payload through unchanged', (done) => {
    const items = [1, 2, 3];
    const handler = buildCallHandler(items);

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result.data).toEqual(items);
      done();
    });
  });

  it('passes an empty object through unchanged', (done) => {
    const handler = buildCallHandler({});

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result.data).toEqual({});
      done();
    });
  });

  it('does not include a message field in the envelope by default', (done) => {
    const handler = buildCallHandler({ value: 42 });

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result).not.toHaveProperty('message');
      done();
    });
  });

  it('passes string data through unchanged', (done) => {
    const handler = buildCallHandler('hello');

    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result.data).toBe('hello');
      done();
    });
  });
});
