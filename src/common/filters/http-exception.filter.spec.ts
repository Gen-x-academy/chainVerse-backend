import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function buildHost(url = '/test', headers: Record<string, string> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url, method: 'GET', headers }),
      }),
    } as any,
    status,
    json,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let loggerError: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    // Suppress logger output – we assert call args selectively below
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Shape guarantees ───────────────────────────────────────────────────────

  it('always returns statusCode, error, message, timestamp, and path', () => {
    const { host, status, json } = buildHost('/shape-check');
    filter.catch(new BadRequestException('bad'), host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 400,
      error: expect.any(String),
      message: expect.anything(),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      path: '/shape-check',
    });
  });

  it('includes requestId in payload when X-Request-Id header is present', () => {
    const { host, json } = buildHost('/req', { 'x-request-id': 'trace-123' });
    filter.catch(new BadRequestException('bad'), host);

    expect(json.mock.calls[0][0].requestId).toBe('trace-123');
  });

  it('omits requestId from payload when X-Request-Id header is absent', () => {
    const { host, json } = buildHost('/req');
    filter.catch(new BadRequestException('bad'), host);

    expect(json.mock.calls[0][0].requestId).toBeUndefined();
  });

  // ── Validation errors (400) ────────────────────────────────────────────────

  describe('validation errors', () => {
    it('formats BadRequestException with a string message', () => {
      const { host, status, json } = buildHost();
      filter.catch(new BadRequestException('Email is required'), host);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Email is required' }),
      );
    });

    it('formats BadRequestException with an array of messages', () => {
      const { host, status, json } = buildHost();
      filter.catch(
        new BadRequestException(['must be email', 'password too short']),
        host,
      );

      expect(status).toHaveBeenCalledWith(400);
      const body = json.mock.calls[0][0];
      expect(body.message).toEqual(['must be email', 'password too short']);
    });

    it('formats ConflictException (409)', () => {
      const { host, status, json } = buildHost('/student/create');
      filter.catch(new ConflictException('Email already registered'), host);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          message: 'Email already registered',
          path: '/student/create',
        }),
      );
    });

    it('logs 4xx errors at warn level', () => {
      const { host } = buildHost();
      filter.catch(new BadRequestException('bad input'), host);

      expect(loggerWarn).toHaveBeenCalledTimes(1);
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  // ── Auth errors (401 / 403) ────────────────────────────────────────────────

  describe('auth errors', () => {
    it('formats UnauthorizedException (401)', () => {
      const { host, status, json } = buildHost('/student/login');
      filter.catch(new UnauthorizedException('Invalid credentials'), host);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid credentials',
          path: '/student/login',
        }),
      );
    });

    it('formats ForbiddenException (403)', () => {
      const { host, status, json } = buildHost('/admin/auth');
      filter.catch(new ForbiddenException('Insufficient permissions'), host);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Insufficient permissions',
          path: '/admin/auth',
        }),
      );
    });
  });

  // ── Domain errors (404) ────────────────────────────────────────────────────

  describe('domain errors', () => {
    it('formats NotFoundException (404)', () => {
      const { host, status, json } = buildHost('/admin/auth/missing-id');
      filter.catch(new NotFoundException('AdminAuth item not found'), host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'AdminAuth item not found',
          path: '/admin/auth/missing-id',
        }),
      );
    });
  });

  // ── Raw HttpException ──────────────────────────────────────────────────────

  it('handles a plain HttpException with a string response', () => {
    const { host, status, json } = buildHost();
    filter.catch(new HttpException('Custom message', HttpStatus.BAD_GATEWAY), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json.mock.calls[0][0].message).toBe('Custom message');
  });

  it('handles a plain HttpException with an object response', () => {
    const { host, status, json } = buildHost();
    filter.catch(
      new HttpException({ message: 'Custom', error: 'My Error' }, 422),
      host,
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, message: 'Custom', error: 'My Error' }),
    );
  });

  // ── Unknown / non-HTTP errors → 500 ───────────────────────────────────────

  describe('unknown errors', () => {
    it('returns 500 for a plain Error', () => {
      const { host, status, json } = buildHost('/crash');
      filter.catch(new Error('DB connection lost'), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, path: '/crash' }),
      );
    });

    it('returns 500 for a thrown string', () => {
      const { host, status } = buildHost();
      filter.catch('something exploded', host);

      expect(status).toHaveBeenCalledWith(500);
    });

    it('returns 500 for null', () => {
      const { host, status } = buildHost();
      filter.catch(null, host);

      expect(status).toHaveBeenCalledWith(500);
    });

    it('does not leak internal error details in the message', () => {
      const { host, json } = buildHost();
      filter.catch(new Error('secret internal detail'), host);

      expect(json.mock.calls[0][0].message).toBe('Internal server error');
    });

    it('logs 5xx errors at error level', () => {
      const { host } = buildHost();
      filter.catch(new Error('boom'), host);

      expect(loggerError).toHaveBeenCalledTimes(1);
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('includes the request path in the error log context', () => {
      const { host } = buildHost('/crash-path');
      filter.catch(new Error('boom'), host);

      const [context] = loggerError.mock.calls[0];
      expect(context).toMatchObject({ path: '/crash-path', statusCode: 500 });
    });
  });

  // ── path reflects request url ──────────────────────────────────────────────

  it('records the correct request path in the payload', () => {
    const { host, json } = buildHost('/some/nested/route?q=1');
    filter.catch(new NotFoundException('Not found'), host);

    expect(json.mock.calls[0][0].path).toBe('/some/nested/route?q=1');
  });
});
