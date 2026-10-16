import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

const mockSendMail = jest.fn();

describe('EmailService', () => {
  let service: EmailService;
  let configService: ConfigService;

  const baseConfig: Record<string, unknown> = {
    'smtp.host': 'smtp.example.com',
    'smtp.port': 587,
    'smtp.secure': false,
    'email.user': 'user@example.com',
    'email.pass': 'secret',
    'email.from': 'noreply@chainverse.academy',
    baseUrl: 'https://chainverse.academy',
  };

  function buildModule(configOverrides: Record<string, unknown> = {}) {
    const cfg = { ...baseConfig, ...configOverrides };
    return Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => cfg[key],
          },
        },
      ],
    }).compile();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });
  });

  describe('constructor — SMTP fully configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await buildModule();
      service = module.get(EmailService);
      configService = module.get(ConfigService);
    });

    it('creates a nodemailer transporter with correct options', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' },
      });
    });
  });

  describe('constructor — SMTP not configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await buildModule({
        'smtp.host': undefined,
        'smtp.port': undefined,
        'email.user': undefined,
        'email.pass': undefined,
      });
      service = module.get(EmailService);
    });

    it('does not create a transporter when SMTP env vars are missing', () => {
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  // ─── send() ──────────────────────────────────────────────────────────────────

  describe('send()', () => {
    beforeEach(async () => {
      const module: TestingModule = await buildModule();
      service = module.get(EmailService);
      configService = module.get(ConfigService);
    });

    it('calls sendMail with the correct arguments', async () => {
      mockSendMail.mockResolvedValueOnce({});
      await service.send('to@test.com', 'Hello', 'Body text');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@chainverse.academy',
        to: 'to@test.com',
        subject: 'Hello',
        text: 'Body text',
      });
    });

    it('falls back to default from address when email.from is not configured', async () => {
      const module = await buildModule({ 'email.from': undefined });
      service = module.get(EmailService);
      mockSendMail.mockResolvedValueOnce({});

      await service.send('to@test.com', 'Subject', 'text');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@chainverse.academy' }),
      );
    });

    it('does not throw when SMTP is not configured (logs warning instead)', async () => {
      const module = await buildModule({
        'smtp.host': undefined,
        'smtp.port': undefined,
        'email.user': undefined,
        'email.pass': undefined,
      });
      service = module.get(EmailService);

      await expect(
        service.send('to@test.com', 'Subject', 'text'),
      ).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('propagates errors thrown by the transporter', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));
      await expect(
        service.send('to@test.com', 'Subject', 'text'),
      ).rejects.toThrow('SMTP connection refused');
    });
  });

  // ─── sendPasswordReset() ─────────────────────────────────────────────────────

  describe('sendPasswordReset()', () => {
    beforeEach(async () => {
      const module: TestingModule = await buildModule();
      service = module.get(EmailService);
    });

    it('sends an email containing a reset link with the provided token', async () => {
      mockSendMail.mockResolvedValueOnce({});
      await service.sendPasswordReset(
        'user@example.com',
        'my-reset-token',
        'https://app.chainverse.academy',
      );

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toMatch(/password/i);
      expect(callArgs.text).toContain('my-reset-token');
      expect(callArgs.text).toContain('https://app.chainverse.academy');
      expect(callArgs.html).toContain('my-reset-token');
    });

    it('uses baseUrl from config when no explicit baseUrl is supplied', async () => {
      mockSendMail.mockResolvedValueOnce({});
      await service.sendPasswordReset('user@example.com', 'token-xyz');

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.text).toContain('https://chainverse.academy');
    });

    it('falls back to localhost when baseUrl config is also absent', async () => {
      const module = await buildModule({ baseUrl: undefined });
      service = module.get(EmailService);
      mockSendMail.mockResolvedValueOnce({});

      await service.sendPasswordReset('user@example.com', 'token');

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.text).toContain('http://localhost:3000');
    });

    it('does not send when SMTP is not configured', async () => {
      const module = await buildModule({
        'smtp.host': undefined,
        'smtp.port': undefined,
        'email.user': undefined,
        'email.pass': undefined,
      });
      service = module.get(EmailService);

      await expect(
        service.sendPasswordReset('user@example.com', 'token'),
      ).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ─── sendVerificationEmail() ─────────────────────────────────────────────────

  describe('sendVerificationEmail()', () => {
    beforeEach(async () => {
      const module: TestingModule = await buildModule();
      service = module.get(EmailService);
    });

    it('sends an email containing the encoded verification link', async () => {
      mockSendMail.mockResolvedValueOnce({});
      const token = 'verify-token-abc123';
      await service.sendVerificationEmail('student@example.com', token);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.to).toBe('student@example.com');
      expect(callArgs.subject).toMatch(/verify/i);
      expect(callArgs.text).toContain(encodeURIComponent(token));
      expect(callArgs.html).toContain(encodeURIComponent(token));
    });

    it('includes the configured baseUrl in the verification link', async () => {
      mockSendMail.mockResolvedValueOnce({});
      await service.sendVerificationEmail('student@example.com', 'tok');

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.text).toContain('https://chainverse.academy');
    });

    it('falls back to localhost when baseUrl config is absent', async () => {
      const module = await buildModule({ baseUrl: undefined });
      service = module.get(EmailService);
      mockSendMail.mockResolvedValueOnce({});

      await service.sendVerificationEmail('student@example.com', 'tok');

      const callArgs = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(callArgs.text).toContain('http://localhost:3000');
    });

    it('does not send when SMTP is not configured', async () => {
      const module = await buildModule({
        'smtp.host': undefined,
        'smtp.port': undefined,
        'email.user': undefined,
        'email.pass': undefined,
      });
      service = module.get(EmailService);

      await expect(
        service.sendVerificationEmail('student@example.com', 'tok'),
      ).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('propagates errors thrown by the transporter', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Auth failed'));
      await expect(
        service.sendVerificationEmail('student@example.com', 'tok'),
      ).rejects.toThrow('Auth failed');
    });
  });
});
