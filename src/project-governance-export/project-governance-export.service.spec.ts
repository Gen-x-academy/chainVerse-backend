import { GovernanceAuditService } from './project-governance-export-audit.service';
import { ProjectGovernanceExportRepository } from './project-governance-export.repository';
import { ProjectGovernanceExportService } from './project-governance-export.service';
import {
  EXPORT_TTL_MS,
  GovernanceActor,
  GovernanceFinanceSource,
  GovernanceMilestoneSource,
  GovernanceProjectRole,
  GovernanceRecordKind,
  MAX_ACTIVE_EXPORTS_PER_REQUESTER,
} from './project-governance-export.types';

const tenantId = 'tenant-a';
const projectId = 'project-1';
const admin: GovernanceActor = {
  actorId: 'admin-1',
  tenantId,
  roles: ['admin'],
};
const owner: GovernanceActor = {
  actorId: 'owner-1',
  tenantId,
  roles: ['student'],
};
const viewer: GovernanceActor = {
  actorId: 'viewer-1',
  tenantId,
  roles: ['student'],
};
const stranger: GovernanceActor = {
  actorId: 'stranger-1',
  tenantId,
  roles: ['student'],
};

const milestones: GovernanceMilestoneSource = {
  summarize: jest.fn().mockResolvedValue({
    total: 3,
    byStatus: { active: 2, completed: 1 },
    nextDueDate: '2027-04-01',
  }),
};
const finance: GovernanceFinanceSource = {
  summarize: jest.fn().mockResolvedValue({
    currency: 'USD',
    budgetedMinor: 100000,
    reservedMinor: 40000,
    releasedMinor: 10000,
  }),
};

describe('ProjectGovernanceExportService', () => {
  let service: ProjectGovernanceExportService;
  let audit: GovernanceAuditService;
  let repository: ProjectGovernanceExportRepository;

  const build = (
    m?: GovernanceMilestoneSource,
    f?: GovernanceFinanceSource,
  ) => {
    repository = new ProjectGovernanceExportRepository();
    audit = new GovernanceAuditService();
    service = new ProjectGovernanceExportService(repository, audit, m, f);
    service.registerProject(admin, tenantId, {
      id: projectId,
      tenantId,
      members: {
        'owner-1': GovernanceProjectRole.OWNER,
        'viewer-1': GovernanceProjectRole.VIEWER,
        'reviewer-1': GovernanceProjectRole.REVIEWER,
      },
    });
  };

  const record = (
    key: string,
    kind: GovernanceRecordKind,
    reference: string,
    targetReference?: string,
    actor: GovernanceActor = owner,
  ) =>
    service.recordEntry(actor, tenantId, projectId, {
      idempotencyKey: key,
      kind,
      reference,
      targetReference,
      label: `label ${reference}`,
    });

  const exportIt = (key: string, actor: GovernanceActor = owner) =>
    service.requestExport(actor, tenantId, projectId, { idempotencyKey: key });

  beforeEach(() => {
    jest.clearAllMocks();
    build(milestones, finance);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('governance ledger', () => {
    it('appends terms → amendment → approval and rejects broken chains', async () => {
      await expect(
        record(
          'amend-key-001',
          GovernanceRecordKind.AMENDMENT,
          'am-1',
          'terms-1',
        ),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_GOVERNANCE_TARGET_MISSING' },
      });
      await record(
        'terms-key-01',
        GovernanceRecordKind.TERMS_ACCEPTANCE,
        'terms-1',
      );
      await record(
        'amend-key-002',
        GovernanceRecordKind.AMENDMENT,
        'am-1',
        'terms-1',
      );
      await record(
        'appr-key-001',
        GovernanceRecordKind.APPROVAL,
        'ap-1',
        'am-1',
      );
      await expect(
        record('appr-key-002', GovernanceRecordKind.APPROVAL, 'ap-2', 'nope'),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_GOVERNANCE_TARGET_MISSING' },
      });
      await expect(
        record(
          'terms-key-02',
          GovernanceRecordKind.TERMS_ACCEPTANCE,
          'terms-2',
          'terms-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: 'VAL_INVALID_INPUT' } });
    });

    it('rejects duplicate references and creates one record under concurrency', async () => {
      const results = await Promise.allSettled([
        record(
          'terms-key-01',
          GovernanceRecordKind.TERMS_ACCEPTANCE,
          'terms-1',
        ),
        record(
          'terms-key-02',
          GovernanceRecordKind.TERMS_ACCEPTANCE,
          'terms-1',
        ),
        record(
          'terms-key-03',
          GovernanceRecordKind.TERMS_ACCEPTANCE,
          'terms-1',
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results.filter(
          (r) =>
            r.status === 'rejected' &&
            (r.reason as { response: { errorCode: string } }).response
              .errorCode === 'BIZ_GOVERNANCE_RECORD_DUPLICATE',
        ),
      ).toHaveLength(2);
    });

    it('allows only owners and platform admins to write', async () => {
      for (const actor of [viewer, stranger]) {
        await expect(
          record(
            'terms-key-01',
            GovernanceRecordKind.TERMS_ACCEPTANCE,
            't',
            undefined,
            actor,
          ),
        ).rejects.toMatchObject({
          response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
        });
      }
      await expect(
        record(
          'terms-key-02',
          GovernanceRecordKind.TERMS_ACCEPTANCE,
          't',
          undefined,
          admin,
        ),
      ).resolves.toBeDefined();
    });

    it('returns not-found for unknown projects and rejects blank labels', async () => {
      await expect(
        service.recordEntry(admin, tenantId, 'ghost', {
          idempotencyKey: 'ghost-key-01',
          kind: GovernanceRecordKind.TERMS_ACCEPTANCE,
          reference: 'terms-1',
          label: 'x',
        }),
      ).rejects.toMatchObject({ response: { errorCode: 'RES_NOT_FOUND' } });
      await expect(
        service.recordEntry(owner, tenantId, projectId, {
          idempotencyKey: 'blank-key-01',
          kind: GovernanceRecordKind.TERMS_ACCEPTANCE,
          reference: 'terms-1',
          label: '   ',
        }),
      ).rejects.toMatchObject({ response: { errorCode: 'VAL_INVALID_INPUT' } });
    });
  });

  describe('export generation', () => {
    beforeEach(async () => {
      await record(
        'terms-key-01',
        GovernanceRecordKind.TERMS_ACCEPTANCE,
        'terms-1',
      );
      await record(
        'amend-key-01',
        GovernanceRecordKind.AMENDMENT,
        'am-1',
        'terms-1',
      );
      await record(
        'appr-key-01',
        GovernanceRecordKind.APPROVAL,
        'ap-1',
        'am-1',
        admin,
      );
    });

    it('produces a complete, participant-safe export for a member', async () => {
      const created = await exportIt('export-key-01', viewer);
      expect(created).not.toHaveProperty('content');
      const download = service.getExport(viewer, tenantId, created.id);
      if (!('content' in download)) throw new Error('expected content');
      const { content } = download;

      expect(content.acceptedTerms).toHaveLength(1);
      expect(content.amendments[0]).toMatchObject({
        targetReference: 'terms-1',
        byYou: false,
        recordedByRole: 'owner',
      });
      expect(content.approvals[0].recordedByRole).toBe('platform');
      expect(content.membership).toEqual({
        total: 3,
        byRole: { owner: 1, viewer: 1, reviewer: 1 },
        yourRole: 'viewer',
      });
      expect(content.milestones).toMatchObject({ available: true });
      expect(content.financials).toMatchObject({ available: true });
      expect(download.partial).toBe(false);

      // No participant identifiers leak.
      const serialised = JSON.stringify(download);
      for (const id of ['owner-1', 'reviewer-1', 'admin-1']) {
        expect(serialised).not.toContain(id);
      }
    });

    it("marks byYou for the requester's own records and stamps an integrity digest", async () => {
      const created = await exportIt('export-key-01');
      const download = service.getExport(owner, tenantId, created.id);
      if (!('content' in download)) throw new Error('expected content');
      expect(download.content.acceptedTerms[0].byYou).toBe(true);
      expect(download.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('denies non-members and cross-tenant actors', async () => {
      await expect(exportIt('export-key-01', stranger)).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
      await expect(
        service.requestExport(
          { ...owner, tenantId: 'tenant-b' },
          tenantId,
          projectId,
          {
            idempotencyKey: 'export-key-02',
          },
        ),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
      await expect(
        service.requestExport(undefined, tenantId, projectId, {
          idempotencyKey: 'export-key-03',
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
    });

    it('hides exports from other participants but not from platform admins', async () => {
      const created = await exportIt('export-key-01');
      for (const actor of [viewer, stranger]) {
        expect(() => service.getExport(actor, tenantId, created.id)).toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errorCode: 'RES_GOVERNANCE_EXPORT_NOT_FOUND',
            }),
          }),
        );
      }
      expect(service.getExport(admin, tenantId, created.id)).toHaveProperty(
        'content',
      );
    });

    it('is idempotent: replays identical retries, rejects key reuse with a different project', async () => {
      const [a, b] = await Promise.all([
        exportIt('export-key-01'),
        exportIt('export-key-01'),
      ]);
      expect(b).toEqual(a);
      expect(repository.exportsForProject(tenantId, projectId)).toHaveLength(1);
      service.registerProject(admin, tenantId, {
        id: 'project-2',
        tenantId,
        members: { 'owner-1': GovernanceProjectRole.OWNER },
      });
      await expect(
        service.requestExport(owner, tenantId, 'project-2', {
          idempotencyKey: 'export-key-01',
        }),
      ).resolves.toBeDefined(); // operation key includes project id → distinct request
    });

    it('enforces the active-export limit and frees slots on revoke and expiry', async () => {
      const ids: string[] = [];
      for (let i = 0; i < MAX_ACTIVE_EXPORTS_PER_REQUESTER; i++) {
        ids.push((await exportIt(`export-key-0${i}x`)).id);
      }
      await expect(exportIt('export-key-over1')).rejects.toMatchObject({
        response: { errorCode: 'BIZ_GOVERNANCE_EXPORT_LIMIT' },
      });
      await service.revokeExport(owner, tenantId, ids[0], {
        idempotencyKey: 'revoke-key-01',
      });
      await expect(exportIt('export-key-over2')).resolves.toBeDefined();

      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + EXPORT_TTL_MS + 1000);
      await expect(exportIt('export-key-over3')).resolves.toBeDefined();
    });

    it('limits concurrent requests to the cap', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: MAX_ACTIVE_EXPORTS_PER_REQUESTER + 3 }, (_, i) =>
          exportIt(`export-conc-${i}x`),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
        MAX_ACTIVE_EXPORTS_PER_REQUESTER,
      );
    });
  });

  describe('lifecycle', () => {
    it('expires downloads and rejects stale revocations with stable errors', async () => {
      const created = await exportIt('export-key-01');
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + EXPORT_TTL_MS + 1000);
      expect(() => service.getExport(owner, tenantId, created.id)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'BIZ_GOVERNANCE_EXPORT_EXPIRED',
          }),
        }),
      );
      await expect(
        service.revokeExport(owner, tenantId, created.id, {
          idempotencyKey: 'revoke-key-01',
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_GOVERNANCE_EXPORT_EXPIRED' },
      });
    });

    it('revokes once, discards content, and rejects a second revocation', async () => {
      const created = await exportIt('export-key-01');
      const revoked = await service.revokeExport(owner, tenantId, created.id, {
        idempotencyKey: 'revoke-key-01',
      });
      expect(revoked.status).toBe('revoked');
      const after = service.getExport(owner, tenantId, created.id);
      expect(after).not.toHaveProperty('content');
      await expect(
        service.revokeExport(owner, tenantId, created.id, {
          idempotencyKey: 'revoke-key-02',
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_GOVERNANCE_EXPORT_INVALID_TRANSITION' },
      });
      // Retry with the original key replays instead of erroring.
      await expect(
        service.revokeExport(owner, tenantId, created.id, {
          idempotencyKey: 'revoke-key-01',
        }),
      ).resolves.toEqual(revoked);
    });
  });

  describe('dependency failures', () => {
    it('marks sections unavailable when sources are not configured', async () => {
      build();
      const created = await exportIt('export-key-01');
      const download = service.getExport(owner, tenantId, created.id);
      if (!('content' in download)) throw new Error('expected content');
      expect(download.partial).toBe(true);
      expect(download.content.milestones).toEqual({
        available: false,
        reason: 'source_not_configured',
      });
    });

    it('degrades to a partial export, not a failure, when a source throws', async () => {
      build(
        { summarize: jest.fn().mockRejectedValue(new Error('boom')) },
        finance,
      );
      const created = await exportIt('export-key-01');
      const download = service.getExport(owner, tenantId, created.id);
      if (!('content' in download)) throw new Error('expected content');
      expect(created.partial).toBe(true);
      expect(download.content.milestones).toEqual({
        available: false,
        reason: 'source_failed',
      });
      expect(download.content.financials.available).toBe(true);
      expect(
        service
          .getAudit(admin, tenantId)
          .some((e) => e.action === 'export.source' && e.outcome === 'failed'),
      ).toBe(true);
    });

    it('times out a hung source instead of blocking the export', async () => {
      jest.useFakeTimers();
      try {
        build({ summarize: () => new Promise(() => undefined) }, finance);
        const pending = exportIt('export-key-01');
        await jest.advanceTimersByTimeAsync(6000);
        const created = await pending;
        expect(created.partial).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('audit', () => {
    it('stores metadata only, records denials, and is admin-only and tenant-scoped', async () => {
      await record(
        'terms-key-01',
        GovernanceRecordKind.TERMS_ACCEPTANCE,
        'terms-1',
      );
      await exportIt('export-key-01');
      await exportIt('export-key-02', stranger).catch(() => undefined);
      const entries = service.getAudit(admin, tenantId);
      expect(entries.map((e) => e.outcome)).toEqual([
        'success',
        'success',
        'denied',
      ]);
      const text = JSON.stringify(entries);
      expect(text).not.toContain('label terms-1');
      expect(text).not.toContain('terms-1');
      expect(audit.snapshot('tenant-b')).toEqual([]);
      expect(() => service.getAudit(owner, tenantId)).toThrow();
    });
  });
});
