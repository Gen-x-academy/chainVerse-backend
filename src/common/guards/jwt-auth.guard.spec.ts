import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const TEST_SECRET = 'unit-test-jwt-secret-32chars!!!!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(
  payload: Record<string, unknown>,
  secret = TEST_SECRET,
  expiresIn = 3600,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function makeContext(authHeader?: string): ExecutionContext {
  const request = { headers: { authorization: authHeader }, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    guard = new JwtAuthGuard();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  // --- startup guard ---

  it('throws at construction when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => new JwtAuthGuard()).toThrow('JWT_SECRET');
  });

  // --- missing / malformed header ---

  it('rejects requests with no Authorization header', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects non-Bearer Authorization schemes', () => {
    expect(() => guard.canActivate(makeContext('Basic dXNlcjpwYXNz'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a Bearer header with an empty token', () => {
    expect(() => guard.canActivate(makeContext('Bearer '))).toThrow(
      UnauthorizedException,
    );
  });

  // --- structural problems ---

  it('rejects a token with fewer than 3 dot-separated parts', () => {
    expect(() =>
      guard.canActivate(makeContext('Bearer only.two')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a token with more than 3 dot-separated parts', () => {
    expect(() =>
      guard.canActivate(makeContext('Bearer a.b.c.d')),
    ).toThrow(UnauthorizedException);
  });

  // --- signature verification ---

  it('rejects a token signed with a different secret', () => {
    const token = makeToken(
      { sub: 'user-1', email: 'a@b.com', role: 'student' },
      'wrong-secret',
    );
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with a tampered payload', () => {
    const valid = makeToken({ sub: 'user-1', email: 'a@b.com', role: 'student' });
    const [header, , sig] = valid.split('.');
    // Swap in a payload claiming admin role without re-signing
    const evilBody = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        email: 'a@b.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const tampered = `${header}.${evilBody}.${sig}`;
    expect(() => guard.canActivate(makeContext(`Bearer ${tampered}`))).toThrow(
      UnauthorizedException,
    );
  });

  // --- expiry ---

  it('rejects an expired token', () => {
    const token = makeToken(
      { sub: 'user-1', email: 'a@b.com', role: 'student' },
      TEST_SECRET,
      -1, // already expired
    );
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  // --- token type ---

  it('rejects a refresh token used as an access token', () => {
    const token = makeToken({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'student',
      type: 'refresh',
    });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  // --- required claims ---

  it('rejects a token with no sub claim', () => {
    const token = makeToken({ email: 'a@b.com', role: 'student' });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with no email claim', () => {
    const token = makeToken({ sub: 'user-1', role: 'student' });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with no role claim', () => {
    const token = makeToken({ sub: 'user-1', email: 'a@b.com' });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  // --- role must come from token claims, not request headers ---

  it('ignores any role header and derives role solely from the token', () => {
    const token = makeToken({ sub: 'user-1', email: 'a@b.com', role: 'student' });
    const ctx = makeContext(`Bearer ${token}`);
    // Inject a fraudulent role header that should be ignored
    ctx.switchToHttp().getRequest().headers['x-role'] = 'admin';

    guard.canActivate(ctx);

    const user = ctx.switchToHttp().getRequest().user;
    expect(user.role).toBe('student');
  });

  // --- happy path ---

  it('accepts a valid token and sets request.user from claims', () => {
    const token = makeToken({
      sub: 'user-42',
      email: 'student@example.com',
      role: 'student',
    });
    const ctx = makeContext(`Bearer ${token}`);

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    const user = ctx.switchToHttp().getRequest().user;
    expect(user).toEqual({
      id: 'user-42',
      email: 'student@example.com',
      role: 'student',
    });
  });

  it('accepts tokens for each supported role', () => {
    for (const role of ['admin', 'moderator', 'tutor', 'student']) {
      const token = makeToken({ sub: `id-${role}`, email: `${role}@test.com`, role });
      const ctx = makeContext(`Bearer ${token}`);
      expect(guard.canActivate(ctx)).toBe(true);
      expect(ctx.switchToHttp().getRequest().user.role).toBe(role);
    }
  });
});
