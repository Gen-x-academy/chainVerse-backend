import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTOMATION_KEY_ID_HEADER,
  AUTOMATION_NONCE_HEADER,
  AUTOMATION_SIGNATURE_HEADER,
  AUTOMATION_TIMESTAMP_HEADER,
  AUTOMATION_TOKEN_HEADER,
  AutomationTokenGuard,
} from './automation-token.guard';
import { AuthException } from '../../common/errors/domain.exception';
import { createHmac } from 'crypto';

describe('AutomationTokenGuard (Issue #1252)', () => {
  let guard: AutomationTokenGuard;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as any;
    guard = new AutomationTokenGuard(mockConfigService);
  });

  function createMockContext(headers: Record<string, string>, url = '/scholarships/disbursements/execute'): {
    context: ExecutionContext;
    request: { headers: Record<string, string>; url: string; user?: any };
  } {
    const request = { headers, url, user: undefined };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('rejects when no automation credentials are configured', () => {
    mockConfigService.get.mockReturnValue(undefined);
    const { context } = createMockContext({
      [AUTOMATION_TOKEN_HEADER]: 'some-token',
    });

    expect(() => guard.canActivate(context)).toThrow(AuthException);
  });

  it('accepts legacy static token for backwards compatibility', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationToken') return 'legacy-secret-123';
      return undefined;
    });

    const { context, request } = createMockContext({
      [AUTOMATION_TOKEN_HEADER]: 'legacy-secret-123',
    });

    const result = guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.user).toBeDefined();
    expect(request.user.role).toBe('automation');
    expect(request.user.keyId).toBe('legacy-default');
  });

  it('authenticates against versioned credential during overlap rotation', () => {
    const credentials = [
      { id: 'v1-old', secret: 'secret-old-999', expiresAt: Date.now() + 60000 },
      { id: 'v2-new', secret: 'secret-new-111', scopes: ['disbursements:execute'] },
    ];

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationTokens') return credentials;
      return undefined;
    });

    // Authenticate with v2-new
    const { context, request } = createMockContext({
      [AUTOMATION_KEY_ID_HEADER]: 'v2-new',
      [AUTOMATION_TOKEN_HEADER]: 'secret-new-111',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user.keyId).toBe('v2-new');
    expect(request.user.scopes).toEqual(['disbursements:execute']);
  });

  it('rejects expired credential in rotation', () => {
    const credentials = [
      { id: 'v1-expired', secret: 'secret-expired', expiresAt: Date.now() - 10000 },
      { id: 'v2-active', secret: 'secret-active' },
    ];

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationTokens') return credentials;
      return undefined;
    });

    const { context } = createMockContext({
      [AUTOMATION_KEY_ID_HEADER]: 'v1-expired',
      [AUTOMATION_TOKEN_HEADER]: 'secret-expired',
    });

    expect(() => guard.canActivate(context)).toThrow(AuthException);
  });

  it('prevents replay attacks when identical timestamp and nonce are reused', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationToken') return 'secret-replay-test';
      return undefined;
    });

    const now = Date.now();
    const headers = {
      [AUTOMATION_TOKEN_HEADER]: 'secret-replay-test',
      [AUTOMATION_TIMESTAMP_HEADER]: String(now),
      [AUTOMATION_NONCE_HEADER]: 'unique-nonce-abc-123',
    };

    const { context: ctx1 } = createMockContext(headers);
    expect(guard.canActivate(ctx1)).toBe(true);

    // Replay with identical nonce and timestamp should throw
    const { context: ctx2 } = createMockContext(headers);
    expect(() => guard.canActivate(ctx2)).toThrow(AuthException);
  });

  it('rejects stale requests outside clock skew window', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationToken') return 'secret-skew-test';
      return undefined;
    });

    const staleTime = Date.now() - 400_000; // 6.6 minutes ago (> 5m threshold)
    const { context } = createMockContext({
      [AUTOMATION_TOKEN_HEADER]: 'secret-skew-test',
      [AUTOMATION_TIMESTAMP_HEADER]: String(staleTime),
      [AUTOMATION_NONCE_HEADER]: 'nonce-stale',
    });

    expect(() => guard.canActivate(context)).toThrow(AuthException);
  });

  it('authenticates HMAC signature mode', () => {
    const creds = [{ id: 'hmac-key-1', secret: 'super-hmac-secret' }];
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'scholarships.automationTokens') return creds;
      return undefined;
    });

    const now = String(Date.now());
    const nonce = 'hmac-nonce-789';
    const url = '/scholarships/disbursements/execute';
    const payload = `${now}:${nonce}:${url}`;
    const sig = createHmac('sha256', 'super-hmac-secret').update(payload).digest('hex');

    const { context, request } = createMockContext(
      {
        [AUTOMATION_KEY_ID_HEADER]: 'hmac-key-1',
        [AUTOMATION_TIMESTAMP_HEADER]: now,
        [AUTOMATION_NONCE_HEADER]: nonce,
        [AUTOMATION_SIGNATURE_HEADER]: sig,
      },
      url,
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user.keyId).toBe('hmac-key-1');
  });
});
