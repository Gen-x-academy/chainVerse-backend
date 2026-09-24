import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { WebhookVerificationService } from './webhook-verification.service';

describe('WebhookVerificationService', () => {
  let service: WebhookVerificationService;
  const TEST_SECRET = 'test-webhook-secret-key-for-hmac-signing';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, unknown> = {
                WEBHOOK_SECRET: TEST_SECRET,
                WEBHOOK_TIMESTAMP_TOLERANCE_MS: 300000,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookVerificationService>(WebhookVerificationService);
  });

  describe('computeSignature', () => {
    it('should compute HMAC-SHA256 signature', () => {
      const sig = service.computeSignature('hello');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return the same signature for the same input', () => {
      const sig1 = service.computeSignature('test-payload');
      const sig2 = service.computeSignature('test-payload');
      expect(sig1).toBe(sig2);
    });

    it('should return different signatures for different inputs', () => {
      const sig1 = service.computeSignature('payload-1');
      const sig2 = service.computeSignature('payload-2');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const payload = 'test-content';
      const signedContent = `1234567890.${payload}`;
      const signature = service.computeSignature(signedContent);
      expect(service.verifySignature(signedContent, signature)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      expect(
        service.verifySignature('test', 'invalidsignaturehex'),
      ).toBe(false);
    });

    it('should return false for wrong payload', () => {
      const signature = service.computeSignature('correct-payload');
      expect(
        service.verifySignature('wrong-payload', signature),
      ).toBe(false);
    });
  });

  describe('validateTimestamp', () => {
    it('should return true for a recent timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(service.validateTimestamp(now.toString())).toBe(true);
    });

    it('should return true for a timestamp within tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const withinTolerance = now - 60; // 60 seconds ago
      expect(service.validateTimestamp(withinTolerance.toString())).toBe(true);
    });

    it('should return false for an old timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const tooOld = now - 600; // 10 minutes ago (beyond 5 min tolerance)
      expect(service.validateTimestamp(tooOld.toString())).toBe(false);
    });

    it('should return false for a future timestamp beyond tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const future = now + 600;
      expect(service.validateTimestamp(future.toString())).toBe(false);
    });

    it('should return false for non-numeric string', () => {
      expect(service.validateTimestamp('not-a-number')).toBe(false);
    });
  });

  describe('checkAndRecordNonce', () => {
    it('should return true for first-time nonce', () => {
      expect(service.checkAndRecordNonce('1234567890', 'nonce-abc')).toBe(true);
    });

    it('should return false for duplicate nonce', () => {
      service.checkAndRecordNonce('1234567890', 'nonce-dup');
      expect(service.checkAndRecordNonce('1234567890', 'nonce-dup')).toBe(false);
    });

    it('should return true for different nonces with same timestamp', () => {
      expect(service.checkAndRecordNonce('1234567890', 'nonce-1')).toBe(true);
      expect(service.checkAndRecordNonce('1234567890', 'nonce-2')).toBe(true);
    });
  });

  describe('verifyWebhook', () => {
    it('should pass for valid webhook request', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'valid-nonce-1';
      const payload = '{"event":"test"}';
      const signedContent = `${timestamp}.${payload}`;
      const signature = service.computeSignature(signedContent);

      expect(() =>
        service.verifyWebhook(payload, signature, timestamp, nonce),
      ).not.toThrow();
    });

    it('should throw when secret is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebhookVerificationService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();

      const noSecretService =
        module.get<WebhookVerificationService>(WebhookVerificationService);

      expect(() =>
        noSecretService.verifyWebhook('body', 'sig', '123', 'n'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for missing signature header', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      expect(() =>
        service.verifyWebhook('body', undefined, timestamp, 'n'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for missing timestamp header', () => {
      expect(() =>
        service.verifyWebhook('body', 'sig', undefined, 'n'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for missing nonce header', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      expect(() =>
        service.verifyWebhook('body', 'sig', timestamp, undefined),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for expired timestamp', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000 - 600).toString();
      const signature = service.computeSignature(`${oldTimestamp}.body`);
      expect(() =>
        service.verifyWebhook('body', signature, oldTimestamp, 'nonce-old'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      expect(() =>
        service.verifyWebhook('body', 'badsig', timestamp, 'nonce-bad'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw for replayed nonce', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = '{"event":"replay"}';
      const signedContent = `${timestamp}.${payload}`;
      const signature = service.computeSignature(signedContent);

      service.verifyWebhook(payload, signature, timestamp, 'replay-nonce');
      expect(() =>
        service.verifyWebhook(payload, signature, timestamp, 'replay-nonce'),
      ).toThrow(UnauthorizedException);
    });
  });
});
