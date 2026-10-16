import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhookVerificationService } from './webhook-verification.service';
import { WebhookLogService } from './webhook-log.service';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;
  let verificationService: WebhookVerificationService;
  let webhookLogService: WebhookLogService;

  const mockVerifyWebhook = jest.fn();
  const mockLogRejectedSignature = jest.fn().mockResolvedValue(undefined);
  const mockLogRejectedReplay = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    jest.resetAllMocks();

    mockLogRejectedSignature.mockResolvedValue(undefined);
    mockLogRejectedReplay.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureGuard,
        {
          provide: WebhookVerificationService,
          useValue: {
            verifyWebhook: mockVerifyWebhook,
          },
        },
        {
          provide: WebhookLogService,
          useValue: {
            logRejectedSignature: mockLogRejectedSignature,
            logRejectedReplay: mockLogRejectedReplay,
          },
        },
      ],
    }).compile();

    guard = module.get<WebhookSignatureGuard>(WebhookSignatureGuard);
    verificationService =
      module.get<WebhookVerificationService>(WebhookVerificationService);
    webhookLogService = module.get<WebhookLogService>(WebhookLogService);
  });

  const createContext = (headers: Record<string, string>, body: unknown = {}) => {
    const request = {
      headers,
      body,
      webhookMeta: undefined,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  };

  it('should allow request with valid signature', async () => {
    const { context, request } = createContext(
      {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-1',
        'x-webhook-id': 'wh-test',
        'x-webhook-source': 'stripe',
        'x-webhook-event': 'payment.completed',
      },
      { event: 'test' },
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockVerifyWebhook).toHaveBeenCalledWith(
      JSON.stringify({ event: 'test' }),
      'valid-sig',
      '1234567890',
      'nonce-1',
    );
    expect(request.webhookMeta).toEqual({
      webhookId: 'wh-test',
      source: 'stripe',
      eventType: 'payment.completed',
    });
  });

  it('should throw when verification fails', async () => {
    mockVerifyWebhook.mockImplementation(() => {
      throw new Error('Invalid webhook signature');
    });

    const { context } = createContext(
      {
        'x-webhook-signature': 'bad-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-1',
      },
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid webhook signature',
    );
    expect(mockLogRejectedSignature).toHaveBeenCalled();
  });

  it('should log rejected replay when nonce is duplicate', async () => {
    mockVerifyWebhook.mockImplementation(() => {
      throw new Error('Webhook replay detected (duplicate nonce)');
    });

    const { context } = createContext(
      {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-dup',
      },
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Webhook replay detected',
    );
    expect(mockLogRejectedReplay).toHaveBeenCalled();
  });

  it('should generate default webhookId when x-webhook-id header is missing', async () => {
    const { context, request } = createContext(
      {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-1',
      },
      {},
    );

    await guard.canActivate(context);

    expect(request.webhookMeta?.webhookId).toMatch(/^wh_\d+_/);
    expect(request.webhookMeta?.source).toBe('unknown');
    expect(request.webhookMeta?.eventType).toBe('unknown');
  });

  it('should handle string body', async () => {
    const { context } = createContext(
      {
        'x-webhook-signature': 'valid-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-str',
      },
      'raw-string-body',
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockVerifyWebhook).toHaveBeenCalledWith(
      'raw-string-body',
      'valid-sig',
      '1234567890',
      'nonce-str',
    );
  });

  it('should fallback to x-hub-signature-256 header', async () => {
    const { context } = createContext(
      {
        'x-hub-signature-256': 'hub-sig',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'nonce-hub',
      },
      {},
    );

    await guard.canActivate(context);
    expect(mockVerifyWebhook).toHaveBeenCalledWith(
      '{}',
      'hub-sig',
      '1234567890',
      'nonce-hub',
    );
  });

  it('should not throw when logging fails after rejection', async () => {
    mockVerifyWebhook.mockImplementation(() => {
      throw new Error('Invalid webhook signature');
    });
    mockLogRejectedSignature.mockRejectedValue(new Error('DB down'));

    const { context } = createContext(
      {
        'x-webhook-signature': 'bad',
        'x-webhook-timestamp': '1234567890',
        'x-webhook-nonce': 'n1',
      },
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid webhook signature',
    );
  });
});
