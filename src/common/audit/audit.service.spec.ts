import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AuditService, canonicalize } from './audit.service';
import { AuditAction, AuditOutcome } from './audit-action.enum';
import { AuditContext } from './audit-context';
import { REDACTED } from './audit-redaction';
import { AuditLog } from './schemas/audit-log.schema';

const context: AuditContext = {
  actorId: 'admin-1',
  actorEmail: 'admin@chainverse.io',
  actorRole: 'admin',
  requestId: 'req-abc-123',
  ip: '10.0.0.5',
  userAgent: 'jest',
};

const config: Record<string, unknown> = {};

/** Model double that records what would have been persisted. */
const saved: Record<string, unknown>[] = [];
let saveImpl: jest.Mock;

const mockAuditModel: any = jest.fn().mockImplementation(function (
  this: any,
  payload: Record<string, unknown>,
) {
  Object.assign(this, payload);
  this.save = () => saveImpl(payload);
});

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    saved.length = 0;
    for (const key of Object.keys(config)) delete config[key];
    config['jwtSecret'] = 'unit-test-secret';

    saveImpl = jest.fn().mockImplementation((payload) => {
      saved.push(payload);
      return Promise.resolve(payload);
    });
    mockAuditModel.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken(AuditLog.name), useValue: mockAuditModel },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  describe('record', () => {
    it('captures actor, action, target, request ID and timestamp', async () => {
      await service.record({
        action: AuditAction.COURSE_REVIEWED,
        context,
        target: { type: 'course', id: 'course-9' },
      });

      expect(saved).toHaveLength(1);
      const entry = saved[0] as any;

      expect(entry.action).toBe('course.reviewed');
      expect(entry.actor).toEqual({
        id: 'admin-1',
        email: 'admin@chainverse.io',
        role: 'admin',
        ip: '10.0.0.5',
        userAgent: 'jest',
      });
      expect(entry.target).toEqual({ type: 'course', id: 'course-9' });
      expect(entry.requestId).toBe('req-abc-123');
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.outcome).toBe(AuditOutcome.SUCCESS);
      expect(typeof entry.integrityHash).toBe('string');
    });

    it('redacts sensitive fields in before/after snapshots', async () => {
      await service.record({
        action: AuditAction.ADMIN_ACCOUNT_UPDATED,
        context,
        target: { type: 'admin_account', id: 'acct-1' },
        before: { email: 'old@chainverse.io', password: 'old-secret' },
        after: { email: 'new@chainverse.io', password: 'new-secret' },
      });

      const entry = saved[0] as any;
      expect(entry.before.password).toBe(REDACTED);
      expect(entry.after.password).toBe(REDACTED);
      expect(entry.before.email).toBe('o**@chainverse.io');
    });

    it('normalises absent snapshots to null', async () => {
      await service.record({
        action: AuditAction.ORGANIZATION_CREATED,
        context,
        target: { type: 'organization', id: 'org-1' },
      });

      const entry = saved[0] as any;
      expect(entry.before).toBeNull();
      expect(entry.after).toBeNull();
      expect(entry.reason).toBeNull();
    });

    it('records denials, not just successful mutations', async () => {
      await service.record({
        action: AuditAction.FILE_UPLOAD_REJECTED,
        context,
        target: { type: 'worker_upload', id: null },
        outcome: AuditOutcome.DENIED,
        reason: 'magic bytes mismatch',
      });

      const entry = saved[0] as any;
      expect(entry.outcome).toBe(AuditOutcome.DENIED);
      expect(entry.reason).toBe('magic bytes mismatch');
      expect(entry.target.id).toBeNull();
    });

    it('fails open by default so an audit outage cannot break the mutation', async () => {
      saveImpl = jest.fn().mockRejectedValue(new Error('mongo down'));

      await expect(
        service.record({
          action: AuditAction.COURSE_DELETED,
          context,
          target: { type: 'course', id: 'c-1' },
        }),
      ).resolves.toBeNull();
    });

    it('propagates the failure when AUDIT_LOG_FAIL_CLOSED is set', async () => {
      config['audit.failClosed'] = true;
      saveImpl = jest.fn().mockRejectedValue(new Error('mongo down'));

      await expect(
        service.record({
          action: AuditAction.COURSE_DELETED,
          context,
          target: { type: 'course', id: 'c-1' },
        }),
      ).rejects.toThrow('mongo down');
    });
  });

  describe('integrity hash', () => {
    it('verifies an untouched entry', () => {
      const payload = service.buildPayload({
        action: AuditAction.COURSE_PUBLISHED,
        context,
        target: { type: 'course', id: 'course-9' },
        after: { status: 'published' },
      });

      expect(service.verify(payload as never)).toBe(true);
    });

    it('detects a tampered field', () => {
      const payload = service.buildPayload({
        action: AuditAction.COURSE_PUBLISHED,
        context,
        target: { type: 'course', id: 'course-9' },
      });

      payload.action = AuditAction.COURSE_DELETED;

      expect(service.verify(payload as never)).toBe(false);
    });

    it('detects a tampered actor', () => {
      const payload = service.buildPayload({
        action: AuditAction.COURSE_DELETED,
        context,
        target: { type: 'course', id: 'course-9' },
      });

      payload.actor.id = 'someone-else';

      expect(service.verify(payload as never)).toBe(false);
    });

    it('rejects an entry with a truncated hash instead of throwing', () => {
      const payload = service.buildPayload({
        action: AuditAction.COURSE_DELETED,
        context,
        target: { type: 'course', id: 'c-1' },
      });

      payload.integrityHash = 'deadbeef';

      expect(service.verify(payload as never)).toBe(false);
    });

    it('rejects an entry with no hash at all', () => {
      expect(service.verify({ action: 'course.deleted' })).toBe(false);
    });

    it('is stable regardless of property order', () => {
      const a = service.computeIntegrityHash({ x: 1, y: 2 });
      const b = service.computeIntegrityHash({ y: 2, x: 1 });

      expect(a).toBe(b);
    });
  });

  describe('onModuleInit', () => {
    it('warns in production when no dedicated audit key is configured', () => {
      config['nodeEnv'] = 'production';
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      service.onModuleInit();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('AUDIT_HMAC_SECRET is not set'),
      );
    });

    it('stays quiet when a dedicated audit key is configured', () => {
      config['nodeEnv'] = 'production';
      config['audit.hmacSecret'] = 'a-dedicated-audit-secret-of-length-32+';
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      service.onModuleInit();

      expect(warn).not.toHaveBeenCalled();
    });

    it('stays quiet outside production', () => {
      config['nodeEnv'] = 'development';
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      service.onModuleInit();

      expect(warn).not.toHaveBeenCalled();
    });

    it('prefers the dedicated key over jwtSecret for hashing', () => {
      config['audit.hmacSecret'] = 'dedicated-audit-secret';
      const withDedicated = service.computeIntegrityHash({ a: 1 });

      delete config['audit.hmacSecret'];
      const withFallback = service.computeIntegrityHash({ a: 1 });

      expect(withDedicated).not.toBe(withFallback);
    });
  });

  describe('canonicalize', () => {
    it('sorts keys and serialises dates deterministically', () => {
      expect(
        canonicalize({ b: 1, a: new Date('2026-01-01T00:00:00.000Z') }),
      ).toBe('{"a":"2026-01-01T00:00:00.000Z","b":1}');
    });

    it('treats null and undefined identically', () => {
      expect(canonicalize(null)).toBe('null');
      expect(canonicalize(undefined)).toBe('null');
    });
  });
});
