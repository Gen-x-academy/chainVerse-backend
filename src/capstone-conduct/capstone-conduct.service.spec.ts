import { ConductAuditService } from './capstone-conduct-audit.service';
import { CapstoneConductRepository } from './capstone-conduct.repository';
import { CapstoneConductService } from './capstone-conduct.service';
import {
  BreachSeverity,
  BreachStatus,
  ConductActor,
  ConductNotifier,
  ConductStanding,
  ConductTrack,
} from './capstone-conduct.types';

const tenantId = 'tenant-a';
const digest = 'a'.repeat(64);
const admin: ConductActor = { actorId: 'admin-1', tenantId, roles: ['admin'] };
const student: ConductActor = {
  actorId: 'stu-1',
  tenantId,
  roles: ['student'],
};

describe('CapstoneConductService', () => {
  let service: CapstoneConductService;
  let audit: ConductAuditService;

  const publish = (key: string, extra: object = {}) =>
    service.publishPolicy(admin, tenantId, {
      idempotencyKey: key,
      title: 'Code of Conduct',
      contentDigest: digest,
      tracks: [ConductTrack.CAPSTONE],
      ...extra,
    });

  beforeEach(() => {
    audit = new ConductAuditService();
    service = new CapstoneConductService(
      new CapstoneConductRepository(),
      audit,
    );
  });

  describe('policies', () => {
    it('publishes monotonic versions and supersedes the previous one', async () => {
      const v1 = await publish('publish-key-001');
      const v2 = await publish('publish-key-002');
      expect([v1.version, v2.version]).toEqual([1, 2]);
      const all = service.listPolicies(admin, tenantId);
      expect(all.map((p) => p.status)).toEqual(['superseded', 'current']);
    });

    it('denies non-admins and cross-tenant actors (deny by default)', async () => {
      await expect(
        service.publishPolicy(student, tenantId, {
          idempotencyKey: 'student-publish',
          title: 't',
          contentDigest: digest,
          tracks: [ConductTrack.CAPSTONE],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
      await expect(
        service.publishPolicy({ ...admin, tenantId: 'tenant-b' }, tenantId, {
          idempotencyKey: 'cross-tenant-1',
          title: 't',
          contentDigest: digest,
          tracks: [ConductTrack.CAPSTONE],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
      await expect(
        service.publishPolicy(undefined, tenantId, {
          idempotencyKey: 'anonymous-1',
          title: 't',
          contentDigest: digest,
          tracks: [ConductTrack.CAPSTONE],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
    });

    it('rejects a blank title', async () => {
      await expect(
        publish('blank-title-01', { title: '   ' }),
      ).rejects.toMatchObject({
        response: { errorCode: 'VAL_INVALID_INPUT' },
      });
    });

    it('keeps tenants isolated', async () => {
      await publish('publish-key-001');
      const other: ConductActor = {
        actorId: 'x',
        tenantId: 'tenant-b',
        roles: ['student'],
      };
      expect(() =>
        service.getCurrentPolicy(other, 'tenant-b', ConductTrack.CAPSTONE),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'RES_CONDUCT_POLICY_NOT_FOUND',
          }),
        }),
      );
    });
  });

  describe('acknowledgement and enforcement', () => {
    it('is compliant when no policy applies', () => {
      expect(() =>
        service.assertCompliant(tenantId, 'stu-1', ConductTrack.CAPSTONE),
      ).not.toThrow();
    });

    it('requires acknowledgement, then passes', async () => {
      await publish('publish-key-001');
      expect(() =>
        service.assertCompliant(tenantId, 'stu-1', ConductTrack.CAPSTONE),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'BIZ_CONDUCT_ACK_REQUIRED',
          }),
        }),
      );

      const ack = await service.acknowledge(student, tenantId, {
        idempotencyKey: 'ack-key-0001',
        track: ConductTrack.CAPSTONE,
        policyVersion: 1,
      });
      expect(ack.created).toBe(true);
      expect(() =>
        service.assertCompliant(tenantId, 'stu-1', ConductTrack.CAPSTONE),
      ).not.toThrow();
    });

    it('does not apply to tracks outside the policy', async () => {
      await publish('publish-key-001');
      await expect(
        service.acknowledge(student, tenantId, {
          idempotencyKey: 'ack-key-0001',
          track: ConductTrack.RESEARCH,
          policyVersion: 1,
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_CONDUCT_POLICY_NOT_APPLICABLE' },
      });
    });

    it('rejects stale versions with the current version in details', async () => {
      await publish('publish-key-001');
      await publish('publish-key-002');
      await expect(
        service.acknowledge(student, tenantId, {
          idempotencyKey: 'ack-key-0001',
          track: ConductTrack.CAPSTONE,
          policyVersion: 1,
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: 'BIZ_CONDUCT_POLICY_STALE',
          details: { currentVersion: 2 },
        },
      });
    });

    it('requires re-acknowledgement after a new version, but not when waived', async () => {
      await publish('publish-key-001');
      await service.acknowledge(student, tenantId, {
        idempotencyKey: 'ack-key-0001',
        track: ConductTrack.CAPSTONE,
        policyVersion: 1,
      });

      await publish('publish-key-002', { requiresReacknowledgement: false });
      expect(
        service.getStatus(student, tenantId, ConductTrack.CAPSTONE).standing,
      ).toBe(ConductStanding.CURRENT);

      await publish('publish-key-003'); // defaults to requiring re-ack
      const status = service.getStatus(
        student,
        tenantId,
        ConductTrack.CAPSTONE,
      );
      expect(status).toMatchObject({
        standing: ConductStanding.REACKNOWLEDGEMENT_REQUIRED,
        acknowledgedVersion: 1,
        currentPolicyVersion: 3,
        compliant: false,
      });

      await service.acknowledge(student, tenantId, {
        idempotencyKey: 'ack-key-0002',
        track: ConductTrack.CAPSTONE,
        policyVersion: 3,
      });
      expect(
        service.getStatus(student, tenantId, ConductTrack.CAPSTONE).compliant,
      ).toBe(true);
    });

    it('is idempotent across keys and under concurrency', async () => {
      await publish('publish-key-001');
      const results = await Promise.all(
        ['ack-key-0001', 'ack-key-0002', 'ack-key-0003', 'ack-key-0001'].map(
          (idempotencyKey) =>
            service.acknowledge(student, tenantId, {
              idempotencyKey,
              track: ConductTrack.CAPSTONE,
              policyVersion: 1,
            }),
        ),
      );
      // Distinct keys: exactly one creates; the rest see the existing record.
      expect(results.slice(0, 3).filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      // A retry with the original key replays the original response verbatim.
      expect(results[3]).toEqual(results[0]);
      expect(
        service
          .getAudit(admin, tenantId)
          .filter((e) => e.action === 'acknowledgement.create'),
      ).toHaveLength(3);
    });

    it('replays identical retries and rejects key reuse with a different payload', async () => {
      await publish('publish-key-001');
      const dto = {
        idempotencyKey: 'ack-key-0001',
        track: ConductTrack.CAPSTONE,
        policyVersion: 1,
      };
      const first = await service.acknowledge(student, tenantId, dto);
      expect(await service.acknowledge(student, tenantId, dto)).toEqual(first);
      await expect(
        service.acknowledge(student, tenantId, {
          ...dto,
          track: ConductTrack.RESEARCH,
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_IDEMPOTENCY_KEY_REUSED' },
      });
    });

    it("lets only admins read another user's standing", async () => {
      await publish('publish-key-001');
      expect(() =>
        service.getStatus(
          student,
          tenantId,
          ConductTrack.CAPSTONE,
          'someone-else',
        ),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS',
          }),
        }),
      );
      expect(
        service.getStatus(admin, tenantId, ConductTrack.CAPSTONE, 'stu-1')
          .standing,
      ).toBe(ConductStanding.NOT_ACKNOWLEDGED);
    });
  });

  describe('breach references', () => {
    const breach = (key: string, extra: object = {}) =>
      service.recordBreach(admin, tenantId, {
        idempotencyKey: key,
        caseReference: 'CASE-0001',
        subjectUserId: 'stu-1',
        track: ConductTrack.CAPSTONE,
        policyVersion: 1,
        severity: BreachSeverity.MAJOR,
        ...extra,
      });

    beforeEach(async () => {
      await publish('publish-key-001');
    });

    it('is restricted to admins and exposes no reviewer identity', async () => {
      await expect(
        service.recordBreach(student, tenantId, {
          idempotencyKey: 'student-breach',
          caseReference: 'CASE-0002',
          subjectUserId: 'x',
          track: ConductTrack.CAPSTONE,
          policyVersion: 1,
          severity: BreachSeverity.MINOR,
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
      const created = await breach('breach-key-001');
      expect(created).not.toHaveProperty('recordedBy');
      expect(() => service.listBreaches(student, tenantId)).toThrow();
      expect(() => service.getBreach(student, tenantId, created.id)).toThrow();
    });

    it('rejects unknown policy versions and duplicate case references', async () => {
      await expect(
        breach('breach-key-001', { policyVersion: 9 }),
      ).rejects.toMatchObject({
        response: { errorCode: 'RES_CONDUCT_POLICY_NOT_FOUND' },
      });
      await breach('breach-key-002');
      await expect(breach('breach-key-003')).rejects.toMatchObject({
        response: { errorCode: 'RES_ALREADY_EXISTS' },
      });
    });

    it('creates exactly one reference under concurrent submissions', async () => {
      await Promise.allSettled([
        breach('breach-key-001'),
        breach('breach-key-002'),
        breach('breach-key-003'),
      ]);
      expect(service.listBreaches(admin, tenantId)).toHaveLength(1);
    });

    it('enforces the lifecycle and rejects stale transitions', async () => {
      const created = await breach('breach-key-001');
      const move = (key: string, status: BreachStatus) =>
        service.transitionBreach(admin, tenantId, created.id, {
          idempotencyKey: key,
          status,
        });
      await expect(
        move('transition-01', BreachStatus.UPHELD),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_CONDUCT_BREACH_INVALID_TRANSITION' },
      });
      expect(
        (await move('transition-02', BreachStatus.UNDER_REVIEW)).status,
      ).toBe('under_review');
      expect((await move('transition-03', BreachStatus.UPHELD)).status).toBe(
        'upheld',
      );
      await expect(
        move('transition-04', BreachStatus.DISMISSED),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_CONDUCT_BREACH_INVALID_TRANSITION' },
      });
    });

    it('returns not-found for unknown or cross-tenant breaches', async () => {
      const created = await breach('breach-key-001');
      const otherAdmin: ConductActor = {
        actorId: 'a2',
        tenantId: 'tenant-b',
        roles: ['admin'],
      };
      expect(() =>
        service.getBreach(otherAdmin, 'tenant-b', created.id),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'RES_CONDUCT_BREACH_NOT_FOUND',
          }),
        }),
      );
    });
  });

  describe('notifications and audit', () => {
    it('keeps the policy published when the notifier fails, and audits the failure', async () => {
      const notifier: ConductNotifier = {
        reacknowledgementRequired: jest
          .fn()
          .mockRejectedValue(new Error('smtp down')),
      };
      service = new CapstoneConductService(
        new CapstoneConductRepository(),
        audit,
        notifier,
      );
      const policy = await publish('publish-key-001');
      expect(policy.version).toBe(1);
      expect(service.listPolicies(admin, tenantId)).toHaveLength(1);
      expect(service.getAudit(admin, tenantId).map((e) => e.outcome)).toContain(
        'failed',
      );
    });

    it('notifies once per publish, even on retry', async () => {
      const notifier: ConductNotifier = {
        reacknowledgementRequired: jest.fn().mockResolvedValue(undefined),
      };
      service = new CapstoneConductService(
        new CapstoneConductRepository(),
        audit,
        notifier,
      );
      await Promise.all([
        publish('publish-key-001'),
        publish('publish-key-001'),
      ]);
      expect(notifier.reacknowledgementRequired).toHaveBeenCalledTimes(1);
    });

    it('records metadata only and scopes the log to the tenant', async () => {
      await publish('publish-key-001');
      await service.acknowledge(student, tenantId, {
        idempotencyKey: 'ack-key-0001',
        track: ConductTrack.CAPSTONE,
        policyVersion: 1,
      });
      await expect(
        service.acknowledge(student, tenantId, {
          idempotencyKey: 'ack-key-0002',
          track: ConductTrack.CAPSTONE,
          policyVersion: 7,
        }),
      ).rejects.toBeDefined();
      const entries = service.getAudit(admin, tenantId);
      expect(entries.map((e) => e.outcome)).toEqual([
        'success',
        'success',
        'failed',
      ]);
      expect(JSON.stringify(entries)).not.toContain('Code of Conduct');
      expect(audit.snapshot('tenant-b')).toEqual([]);
      expect(() => service.getAudit(student, tenantId)).toThrow();
    });
  });
});
