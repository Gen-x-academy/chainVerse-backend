import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  const createContext = (authHeader?: string) => {
    const request: any = {
      headers: authHeader ? { authorization: authHeader } : {},
      user: undefined,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    guard = new JwtAuthGuard(
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
    );
  });

  it('should throw when Authorization header is missing', () => {
    const { context } = createContext();

    expect(() => guard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw for invalid signature', () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const { context } = createContext('Bearer invalid.token');

    expect(() => guard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw for expired token', () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const { context } = createContext('Bearer expired.token');

    expect(() => guard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw if refresh token is used as access token', () => {
    mockJwtService.verify.mockReturnValue({
      sub: '123',
      email: 'test@example.com',
      role: 'student',
      type: 'refresh',
    });

    const { context } = createContext('Bearer refresh.token');

    expect(() => guard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw if required claims are missing', () => {
    mockJwtService.verify.mockReturnValue({
      sub: '123',
      type: 'access',
    });

    const { context } = createContext('Bearer invalid.claims');

    expect(() => guard.canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('should validate token, set request.user, and return true', () => {
    const payload = {
      sub: 'user-42',
      email: 'student@example.com',
      role: 'student',
      type: 'access',
    };

    mockJwtService.verify.mockReturnValue(payload);

    const { context, request } = createContext('Bearer valid.token');

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({
      sub: 'user-42',
      id: 'user-42',
      email: 'student@example.com',
      role: 'student',
    });
  });
});