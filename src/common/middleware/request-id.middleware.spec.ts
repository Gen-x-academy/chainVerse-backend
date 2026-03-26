import { RequestIdMiddleware } from './request-id.middleware';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeContext(incomingId?: string) {
  const req: any = { headers: {} };
  if (incomingId !== undefined) req.headers['x-request-id'] = incomingId;
  const res: any = { setHeader: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  // ── ID generation ──────────────────────────────────────────────────────────

  it('generates a UUID v4 when no X-Request-Id header is present', () => {
    const { req, res, next } = makeContext();
    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toMatch(UUID_RE);
  });

  it('preserves an existing X-Request-Id from the caller', () => {
    const clientId = 'my-trace-id-from-upstream';
    const { req, res, next } = makeContext(clientId);
    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toBe(clientId);
  });

  it('generates a different UUID for each request', () => {
    const { req: req1, res: res1, next: next1 } = makeContext();
    const { req: req2, res: res2, next: next2 } = makeContext();

    middleware.use(req1, res1, next1);
    middleware.use(req2, res2, next2);

    expect(req1.headers['x-request-id']).not.toBe(req2.headers['x-request-id']);
  });

  // ── Response header ────────────────────────────────────────────────────────

  it('sets the X-Request-Id response header to match the request ID', () => {
    const { req, res, next } = makeContext();
    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      req.headers['x-request-id'],
    );
  });

  it('echoes an incoming X-Request-Id back in the response header', () => {
    const clientId = 'client-correlation-abc';
    const { req, res, next } = makeContext(clientId);
    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', clientId);
  });

  // ── Middleware chain ───────────────────────────────────────────────────────

  it('calls next() so the request continues through the pipeline', () => {
    const { req, res, next } = makeContext();
    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() even when a request ID is already present', () => {
    const { req, res, next } = makeContext('existing-id');
    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
