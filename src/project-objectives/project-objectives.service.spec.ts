import { ObjectivesAuditService } from './project-objectives-audit.service';
import { ProjectObjectivesRepository } from './project-objectives.repository';
import { ProjectObjectivesService } from './project-objectives.service';
import {
  ObjectiveDirection,
  ObjectivePriority,
  ObjectiveProjectRole,
  ObjectiveStatus,
  ObjectiveVisibility,
  ObjectivesActor,
} from './project-objectives.types';

const tenantId = 'tenant-a';
const projectId = 'project-1';
const admin: ObjectivesActor = {
  actorId: 'admin-1',
  tenantId,
  roles: ['admin'],
};
const owner: ObjectivesActor = {
  actorId: 'owner-1',
  tenantId,
  roles: ['student'],
};
const planner: ObjectivesActor = {
  actorId: 'planner-1',
  tenantId,
  roles: ['student'],
};
const viewer: ObjectivesActor = {
  actorId: 'viewer-1',
  tenantId,
  roles: ['student'],
};
const outsider: ObjectivesActor = {
  actorId: 'outsider-1',
  tenantId,
  roles: ['student'],
};

describe('ProjectObjectivesService', () => {
  let service: ProjectObjectivesService;
  let audit: ObjectivesAuditService;

  const definition = (key: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: key,
    title: 'Raise test coverage',
    priority: ObjectivePriority.HIGH,
    ownerId: 'viewer-1',
    unit: '%',
    direction: ObjectiveDirection.INCREASE,
    baseline: 40,
    target: 80,
    startDate: '2027-01-01',
    targetDate: '2027-06-30',
    visibility: ObjectiveVisibility.TEAM,
    charterReference: 'charter-v1',
    criteria: [
      { label: 'Halfway there', threshold: 60, required: false },
      { label: 'Goal reached', threshold: 80 },
    ],
    ...extra,
  });

  const create = (
    key: string,
    extra: Record<string, unknown> = {},
    actor: ObjectivesActor = owner,
  ) =>
    service.createObjective(
      actor,
      tenantId,
      projectId,
      definition(key, extra) as never,
    );

  const move = (
    id: string,
    status: ObjectiveStatus,
    expectedVersion: number,
    key: string,
    actor = owner,
  ) =>
    service.transitionObjective(actor, tenantId, id, {
      idempotencyKey: key,
      status,
      expectedVersion,
    });

  beforeEach(() => {
    audit = new ObjectivesAuditService();
    service = new ProjectObjectivesService(
      new ProjectObjectivesRepository(),
      audit,
    );
    service.registerProject(admin, tenantId, {
      id: projectId,
      tenantId,
      members: {
        'owner-1': ObjectiveProjectRole.OWNER,
        'planner-1': ObjectiveProjectRole.PLANNER,
        'viewer-1': ObjectiveProjectRole.VIEWER,
      },
    });
  });

  describe('definition', () => {
    it('creates a draft with ordered success criteria and computed progress', async () => {
      const o = await create('create-key-001');
      expect(o).toMatchObject({
        status: 'draft',
        version: 1,
        progressPercent: 0,
        detailed: true,
        ownerId: 'viewer-1',
      });
      expect(o.criteria).toHaveLength(2);
      expect(o.criteria?.every((c) => c.met === false)).toBe(true);
    });

    it.each([
      [
        'target not above baseline when increasing',
        { target: 40 },
        'VAL_OBJECTIVE_TARGET_INVALID',
      ],
      [
        'target not below baseline when decreasing',
        { direction: 'decrease', target: 90 },
        'VAL_OBJECTIVE_TARGET_INVALID',
      ],
      [
        'threshold outside baseline..target',
        { criteria: [{ label: 'x', threshold: 95 }] },
        'VAL_OBJECTIVE_TARGET_INVALID',
      ],
      [
        'start after target date',
        { startDate: '2027-07-01' },
        'VAL_OBJECTIVE_DATES_INVALID',
      ],
      ['blank title', { title: '  ' }, 'VAL_INVALID_INPUT'],
      [
        'blank criterion label',
        { criteria: [{ label: ' ', threshold: 50 }] },
        'VAL_INVALID_INPUT',
      ],
      [
        'owner outside the project',
        { ownerId: 'outsider-1' },
        'BIZ_OBJECTIVE_OWNER_NOT_MEMBER',
      ],
    ])('rejects %s', async (_name, extra, code) => {
      await expect(create('bad-key-0001', extra)).rejects.toMatchObject({
        response: { errorCode: code },
      });
    });

    it('supports decreasing metrics', async () => {
      const o = await create('create-key-001', {
        direction: 'decrease',
        baseline: 100,
        target: 20,
        criteria: [{ label: 'Under 50', threshold: 50 }],
      });
      expect(o.progressPercent).toBe(0);
    });

    it('lists by priority, then creation order', async () => {
      await create('create-key-001', { title: 'low', priority: 'low' });
      await create('create-key-002', {
        title: 'critical',
        priority: 'critical',
      });
      await create('create-key-003', { title: 'high', priority: 'high' });
      expect(
        service.listObjectives(owner, tenantId, projectId).map((o) => o.title),
      ).toEqual(['critical', 'high', 'low']);
    });
  });

  describe('authorization', () => {
    it('allows only owners, planners and platform admins to manage', async () => {
      await expect(
        create('create-key-001', {}, planner),
      ).resolves.toBeDefined();
      await expect(create('create-key-002', {}, admin)).resolves.toBeDefined();
      for (const actor of [viewer, outsider]) {
        await expect(create('create-key-003', {}, actor)).rejects.toMatchObject(
          {
            response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
          },
        );
      }
    });

    it('denies cross-tenant, anonymous and role-less actors', async () => {
      for (const actor of [
        { ...owner, tenantId: 'tenant-b' },
        undefined,
        { ...owner, roles: [] },
      ]) {
        await expect(
          service.createObjective(
            actor,
            tenantId,
            projectId,
            definition('create-key-001') as never,
          ),
        ).rejects.toMatchObject({
          response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
        });
      }
    });

    it('only platform admins create projects; only managers replace them', () => {
      expect(() =>
        service.registerProject(owner, tenantId, {
          id: 'p2',
          tenantId,
          members: {},
        }),
      ).toThrow();
      expect(() =>
        service.registerProject(viewer, tenantId, {
          id: projectId,
          tenantId,
          members: {},
        }),
      ).toThrow();
      expect(() =>
        service.registerProject(owner, tenantId, {
          id: projectId,
          tenantId,
          members: { 'owner-1': ObjectiveProjectRole.OWNER },
        }),
      ).not.toThrow();
      expect(() =>
        service.registerProject(admin, tenantId, {
          id: 'p3',
          tenantId,
          members: { u: 'boss' as never },
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ errorCode: 'VAL_INVALID_INPUT' }),
        }),
      );
    });
  });

  describe('visibility', () => {
    it('hides private objectives from plain members but not from their owner or managers', async () => {
      const priv = await create('create-key-001', { visibility: 'private' }); // owned by viewer-1
      await create('create-key-002', {
        visibility: 'private',
        ownerId: 'planner-1',
        title: 'p2',
      });

      expect(service.listObjectives(viewer, tenantId, projectId)).toHaveLength(
        1,
      ); // own only
      expect(service.listObjectives(planner, tenantId, projectId)).toHaveLength(
        2,
      );
      expect(
        service.listObjectives(outsider, tenantId, projectId),
      ).toHaveLength(0);
      expect(() => service.getObjective(outsider, tenantId, priv.id)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'RES_OBJECTIVE_NOT_FOUND',
          }),
        }),
      );
    });

    it('shows team objectives to members only', async () => {
      const team = await create('create-key-001', { visibility: 'team' });
      expect(service.getObjective(viewer, tenantId, team.id).detailed).toBe(
        true,
      );
      expect(() => service.getObjective(outsider, tenantId, team.id)).toThrow();
    });

    it('gives non-members a minimal view of public objectives', async () => {
      const pub = await create('create-key-001', { visibility: 'public' });
      const view = service.getObjective(outsider, tenantId, pub.id);
      expect(view.detailed).toBe(false);
      for (const hidden of [
        'ownerId',
        'baseline',
        'target',
        'currentValue',
        'criteria',
        'charterReference',
      ]) {
        expect(view).not.toHaveProperty(hidden);
      }
      expect(view.title).toBe('Raise test coverage');
    });

    it('keeps tenants isolated', async () => {
      const o = await create('create-key-001');
      const other: ObjectivesActor = {
        actorId: 'x',
        tenantId: 'tenant-b',
        roles: ['admin'],
      };
      expect(() => service.getObjective(other, 'tenant-b', o.id)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'RES_OBJECTIVE_NOT_FOUND',
          }),
        }),
      );
    });
  });

  describe('lifecycle', () => {
    it('requires a charter and criteria before activation', async () => {
      const noCharter = await create('create-key-001', {
        charterReference: undefined,
      });
      await expect(
        move(noCharter.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001'),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_OBJECTIVE_CHARTER_REQUIRED' },
      });
      const noCriteria = await create('create-key-002', { criteria: [] });
      await expect(
        move(noCriteria.id, ObjectiveStatus.ACTIVE, 1, 'move-key-002'),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_OBJECTIVE_CRITERIA_REQUIRED' },
      });
    });

    it('walks draft → active → achieved once required criteria are met', async () => {
      const o = await create('create-key-001');
      const active = await move(
        o.id,
        ObjectiveStatus.ACTIVE,
        1,
        'move-key-001',
      );
      expect(active).toMatchObject({ status: 'active', version: 2 });

      await expect(
        move(o.id, ObjectiveStatus.ACHIEVED, 2, 'move-key-002'),
      ).rejects.toMatchObject({
        response: {
          errorCode: 'BIZ_OBJECTIVE_CRITERIA_UNMET',
          details: { unmetCount: 1 },
        },
      });

      // The owner (a plain viewer in the project) may report progress.
      const mid = await service.recordProgress(viewer, tenantId, o.id, {
        idempotencyKey: 'prog-key-0001',
        value: 65,
      });
      expect(mid.progressPercent).toBe(63);
      expect(mid.criteria?.map((c) => c.met)).toEqual([true, false]);

      await service.recordProgress(viewer, tenantId, o.id, {
        idempotencyKey: 'prog-key-0002',
        value: 80,
      });
      const done = await move(
        o.id,
        ObjectiveStatus.ACHIEVED,
        4,
        'move-key-003',
      );
      expect(done).toMatchObject({ status: 'achieved', progressPercent: 100 });
    });

    it('handles decreasing metrics when judging criteria', async () => {
      const o = await create('create-key-001', {
        direction: 'decrease',
        baseline: 100,
        target: 20,
        criteria: [{ label: 'Under 30', threshold: 30 }],
      });
      await move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001');
      await service.recordProgress(owner, tenantId, o.id, {
        idempotencyKey: 'prog-key-0001',
        value: 25,
      });
      await expect(
        move(o.id, ObjectiveStatus.ACHIEVED, 3, 'move-key-002'),
      ).resolves.toMatchObject({ status: 'achieved' });
    });

    it('rejects invalid transitions and terminal states with stable errors', async () => {
      const o = await create('create-key-001');
      await expect(
        move(o.id, ObjectiveStatus.ACHIEVED, 1, 'move-key-001'),
      ).rejects.toMatchObject({
        response: {
          errorCode: 'BIZ_OBJECTIVE_INVALID_TRANSITION',
          details: { from: 'draft' },
        },
      });
      await move(o.id, ObjectiveStatus.ABANDONED, 1, 'move-key-002');
      await expect(
        move(o.id, ObjectiveStatus.ACTIVE, 2, 'move-key-003'),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_OBJECTIVE_INVALID_TRANSITION' },
      });
    });

    it('rejects progress unless the objective is active, and from non-owners without manage rights', async () => {
      const o = await create('create-key-001');
      await expect(
        service.recordProgress(owner, tenantId, o.id, {
          idempotencyKey: 'prog-key-0001',
          value: 50,
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_OBJECTIVE_NOT_EDITABLE' },
      });
      await move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001');
      await expect(
        service.recordProgress(outsider, tenantId, o.id, {
          idempotencyKey: 'prog-key-0002',
          value: 50,
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
      });
    });
  });

  describe('stale updates, concurrency and idempotency', () => {
    it('edits drafts only and rejects stale versions', async () => {
      const o = await create('create-key-001');
      const edited = await service.updateObjective(owner, tenantId, o.id, {
        ...definition('update-key-01', { title: 'Renamed' }),
        expectedVersion: 1,
      } as never);
      expect(edited).toMatchObject({ title: 'Renamed', version: 2 });

      await expect(
        service.updateObjective(owner, tenantId, o.id, {
          ...definition('update-key-02'),
          expectedVersion: 1,
        } as never),
      ).rejects.toMatchObject({
        response: {
          errorCode: 'BIZ_OBJECTIVE_STALE_VERSION',
          details: { currentVersion: 2 },
        },
      });

      await move(o.id, ObjectiveStatus.ACTIVE, 2, 'move-key-001');
      await expect(
        service.updateObjective(owner, tenantId, o.id, {
          ...definition('update-key-03'),
          expectedVersion: 3,
        } as never),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_OBJECTIVE_NOT_EDITABLE' },
      });
    });

    it('lets only one of several concurrent transitions at the same version win', async () => {
      const o = await create('create-key-001');
      const results = await Promise.allSettled([
        move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001'),
        move(o.id, ObjectiveStatus.ABANDONED, 1, 'move-key-002'),
        move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-003'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results
          .filter((r) => r.status === 'rejected')
          .every(
            (r) =>
              (r as PromiseRejectedResult).reason.response.errorCode ===
              'BIZ_OBJECTIVE_STALE_VERSION',
          ),
      ).toBe(true);
    });

    it('replays retries with the same key and rejects key reuse with another payload', async () => {
      const [a, b] = await Promise.all([
        create('create-key-001'),
        create('create-key-001'),
      ]);
      expect(b).toEqual(a);
      expect(service.listObjectives(owner, tenantId, projectId)).toHaveLength(
        1,
      );
      await expect(
        create('create-key-001', { title: 'Different' }),
      ).rejects.toMatchObject({
        response: { errorCode: 'BIZ_IDEMPOTENCY_KEY_REUSED' },
      });
    });

    it('replays a transition retry instead of failing on the stale version', async () => {
      const o = await create('create-key-001');
      const first = await move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001');
      await expect(
        move(o.id, ObjectiveStatus.ACTIVE, 1, 'move-key-001'),
      ).resolves.toEqual(first);
    });
  });

  describe('audit', () => {
    it('stores metadata only, records denials, and is admin-only and tenant-scoped', async () => {
      await create('create-key-001');
      await create('create-key-002', {}, outsider).catch(() => undefined);
      await create('create-key-003', { target: 1 }).catch(() => undefined);
      const entries = service.getAudit(admin, tenantId);
      expect(entries.map((e) => e.outcome)).toEqual([
        'success',
        'denied',
        'failed',
      ]);
      const text = JSON.stringify(entries);
      expect(text).not.toContain('Raise test coverage');
      expect(text).not.toContain('charter-v1');
      expect(text).not.toContain('Goal reached');
      expect(audit.snapshot('tenant-b')).toEqual([]);
      expect(() => service.getAudit(owner, tenantId)).toThrow();
    });
  });
});
