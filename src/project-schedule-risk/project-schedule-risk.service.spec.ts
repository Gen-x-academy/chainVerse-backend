import { ScheduleAuditService } from './project-schedule-risk-audit.service';
import { ProjectScheduleRiskRepository } from './project-schedule-risk.repository';
import { ProjectScheduleRiskService } from './project-schedule-risk.service';
import {
  ScheduleActor,
  ScheduleProjectRole,
  ScheduleRiskEvent,
  ScheduleRiskNotifier,
  TaskStatus,
  TaskView,
} from './project-schedule-risk.types';
import { TransitionTaskDto } from './dto/project-schedule-risk.dto';

const T = 'tenant-a';
const actor = (id: string, role: string, tenant = T): ScheduleActor => ({
  actorId: id,
  tenantId: tenant,
  roles: [role],
});
const admin = actor('admin-1', 'admin');
const owner = actor('owner-1', 'student');
const planner = actor('planner-1', 'student');
const viewer = actor('viewer-1', 'student');
const outsider = actor('out-1', 'student');

describe('ProjectScheduleRiskService', () => {
  let repo: ProjectScheduleRiskRepository;
  let audit: ScheduleAuditService;
  let service: ProjectScheduleRiskService;
  let key = 0;
  const k = () => `key-${String(++key).padStart(6, '0')}`;

  const build = (notifier?: ScheduleRiskNotifier) => {
    repo = new ProjectScheduleRiskRepository();
    audit = new ScheduleAuditService();
    service = new ProjectScheduleRiskService(repo, audit, notifier);
    service.registerProject(admin, T, {
      id: 'p1',
      members: {
        'owner-1': ScheduleProjectRole.OWNER,
        'planner-1': ScheduleProjectRole.PLANNER,
        'viewer-1': ScheduleProjectRole.VIEWER,
      },
      deadline: '2027-01-30',
    });
  };
  beforeEach(() => build());

  const create = (
    who: ScheduleActor,
    extra: Record<string, unknown> = {},
    projectId = 'p1',
  ): Promise<TaskView> =>
    service.createTask(who, T, projectId, {
      idempotencyKey: k(),
      title: 'Secret title',
      startDate: '2027-01-01',
      endDate: '2027-01-03',
      ...extra,
    });
  const update = (
    who: ScheduleActor,
    id: string,
    expectedVersion: number,
    extra: Record<string, unknown> = {},
  ) =>
    service.updateTask(who, T, id, {
      idempotencyKey: k(),
      expectedVersion,
      ...extra,
    });
  const move = (
    who: ScheduleActor,
    id: string,
    expectedVersion: number,
    status: TaskStatus,
  ) =>
    service.transitionTask(who, T, id, {
      idempotencyKey: k(),
      expectedVersion,
      status,
    } as TransitionTaskDto);
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as { errorCode?: string }).errorCode;
    }
    return 'NO_ERROR';
  };

  describe('authorization', () => {
    it('denies by default', async () => {
      const dto = {
        idempotencyKey: k(),
        title: 'x',
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      };
      expect(await code(service.createTask(undefined, T, 'p1', dto))).toBe(
        'AUTH_INSUFFICIENT_PERMISSIONS',
      );
      expect(
        await code(
          service.createTask(actor('x', 's', 'tenant-b'), T, 'p1', dto),
        ),
      ).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(
        await code(
          service.createTask(
            { actorId: 'x', tenantId: T, roles: [] },
            T,
            'p1',
            dto,
          ),
        ),
      ).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(() => service.analyze(undefined, T, 'p1')).toThrow();
    });

    it('hides projects from non-members and lets viewers read but not write', async () => {
      const task = await create(owner);
      expect(() => service.listTasks(outsider, T, 'p1')).toThrow(
        expect.objectContaining({ errorCode: 'RES_NOT_FOUND' }),
      );
      expect(() => service.getTask(outsider, T, task.id)).toThrow(
        expect.objectContaining({ errorCode: 'RES_NOT_FOUND' }),
      );
      expect(service.listTasks(viewer, T, 'p1')).toHaveLength(1);
      expect(await code(create(viewer))).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(await code(move(viewer, task.id, 1, TaskStatus.IN_PROGRESS))).toBe(
        'AUTH_INSUFFICIENT_PERMISSIONS',
      );
      expect(
        await code(
          service.takeSnapshot(viewer, T, 'p1', { idempotencyKey: k() }),
        ),
      ).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('keeps tenants apart', async () => {
      await create(owner);
      const other = actor('admin-1', 'admin', 'tenant-b');
      expect(() => service.listTasks(other, 'tenant-b', 'p1')).toThrow(
        expect.objectContaining({ errorCode: 'RES_NOT_FOUND' }),
      );
    });

    it('only platform admins create projects; owners/planners then replace them', () => {
      expect(() =>
        service.registerProject(outsider, T, { id: 'p2', members: {} }),
      ).toThrow(
        expect.objectContaining({ errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' }),
      );
      expect(() =>
        service.registerProject(viewer, T, { id: 'p1', members: {} }),
      ).toThrow(
        expect.objectContaining({ errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' }),
      );
      expect(() =>
        service.registerProject(owner, T, {
          id: 'p1',
          members: { 'owner-1': ScheduleProjectRole.OWNER },
          deadline: '2027-02-01',
        }),
      ).not.toThrow();
      expect(() =>
        service.registerProject(admin, T, {
          id: 'p3',
          members: { u: 'boss' as ScheduleProjectRole },
        }),
      ).toThrow(expect.objectContaining({ errorCode: 'VAL_INVALID_INPUT' }));
    });

    it('minimises what viewers see', async () => {
      const task = await create(owner, { assigneeId: 'person-9' });
      expect(service.getTask(viewer, T, task.id)).not.toHaveProperty(
        'assigneeId',
      );
      expect(service.getTask(viewer, T, task.id).assigned).toBe(true);
      expect(service.getTask(planner, T, task.id).assigneeId).toBe('person-9');
    });

    it('limits the audit log to admins', () => {
      expect(() => service.getAudit(owner, T)).toThrow(
        expect.objectContaining({ errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' }),
      );
      expect(service.getAudit(admin, T)).toEqual([]);
    });
  });

  describe('tasks and dependencies', () => {
    it('creates planned tasks and validates input', async () => {
      const a = await create(planner);
      expect(a).toMatchObject({ status: 'planned', version: 1, dependsOn: [] });
      expect(await code(create(planner, { endDate: '2026-12-31' }))).toBe(
        'VAL_SCHEDULE_DATES_INVALID',
      );
      expect(await code(create(planner, { startDate: 'nonsense' }))).toBe(
        'VAL_SCHEDULE_DATES_INVALID',
      );
      expect(await code(create(planner, { dependsOn: ['ghost'] }))).toBe(
        'BIZ_SCHEDULE_DEPENDENCY_UNKNOWN',
      );
    });

    it('does not accept dependencies from another project or tenant', async () => {
      service.registerProject(admin, T, {
        id: 'p2',
        members: { 'owner-1': ScheduleProjectRole.OWNER },
      });
      const foreign = await create(owner, {}, 'p2');
      expect(await code(create(owner, { dependsOn: [foreign.id] }))).toBe(
        'BIZ_SCHEDULE_DEPENDENCY_UNKNOWN',
      );
    });

    it('enforces size limits', async () => {
      for (let i = 0; i < 200; i++) {
        repo.putTask({
          id: `seed-${i}`,
          tenantId: T,
          projectId: 'p1',
          version: 1,
          title: 't',
          assigneeId: null,
          startDate: '2027-01-01',
          endDate: '2027-01-02',
          dependsOn: [],
          status: TaskStatus.PLANNED,
          createdBy: 'x',
          createdAt: '',
          updatedAt: '',
        });
      }
      expect(await code(create(owner))).toBe('BIZ_SCHEDULE_LIMIT_EXCEEDED');
    });

    it('rejects cycles with the cycle path and leaves the graph unchanged', async () => {
      const a = await create(owner);
      const b = await create(owner, { dependsOn: [a.id] });
      const c = await create(owner, { dependsOn: [b.id] });
      await expect(
        update(owner, a.id, 1, { dependsOn: [c.id] }),
      ).rejects.toMatchObject({
        errorCode: 'BIZ_SCHEDULE_DEPENDENCY_CYCLE',
        response: { details: { cycle: [a.id, c.id, b.id, a.id] } },
      });
      await expect(
        update(owner, a.id, 1, { dependsOn: [a.id] }),
      ).rejects.toMatchObject({
        errorCode: 'BIZ_SCHEDULE_DEPENDENCY_CYCLE',
      });
      expect(service.getTask(owner, T, a.id)).toMatchObject({
        version: 1,
        dependsOn: [],
      });
    });

    it('rejects stale edits and edits to closed tasks', async () => {
      const a = await create(owner);
      await update(owner, a.id, 1, { title: 'new' });
      expect(await code(update(owner, a.id, 1, { title: 'again' }))).toBe(
        'BIZ_SCHEDULE_STALE_VERSION',
      );
      const inProgress = await move(owner, a.id, 2, TaskStatus.IN_PROGRESS);
      const done = await move(owner, a.id, inProgress.version, TaskStatus.DONE);
      expect(
        await code(update(owner, a.id, done.version, { title: 'x' })),
      ).toBe('BIZ_SCHEDULE_TASK_CLOSED');
    });

    it('follows the task lifecycle and rejects invalid moves', async () => {
      const a = await create(owner);
      expect(await code(move(owner, a.id, 1, TaskStatus.DONE))).toBe(
        'BIZ_SCHEDULE_INVALID_TRANSITION',
      );
      const blocked = await move(owner, a.id, 1, TaskStatus.BLOCKED);
      const planned = await move(
        owner,
        a.id,
        blocked.version,
        TaskStatus.PLANNED,
      );
      const cancelled = await move(
        owner,
        a.id,
        planned.version,
        TaskStatus.CANCELLED,
      );
      expect(
        await code(move(owner, a.id, cancelled.version, TaskStatus.PLANNED)),
      ).toBe('BIZ_SCHEDULE_INVALID_TRANSITION');
    });

    it('requires predecessors to be closed before starting or finishing', async () => {
      const a = await create(owner);
      const b = await create(owner, {
        dependsOn: [a.id],
        startDate: '2027-01-04',
        endDate: '2027-01-05',
      });
      expect(await code(move(owner, b.id, 1, TaskStatus.IN_PROGRESS))).toBe(
        'BIZ_SCHEDULE_PREDECESSORS_OPEN',
      );
      const a2 = await move(owner, a.id, 1, TaskStatus.IN_PROGRESS);
      await move(owner, a.id, a2.version, TaskStatus.DONE);
      await expect(
        move(owner, b.id, 1, TaskStatus.IN_PROGRESS),
      ).resolves.toMatchObject({
        status: 'in_progress',
      });
    });
  });

  describe('idempotency and concurrency', () => {
    it('replays a retried create without duplicating it', async () => {
      const dto = {
        idempotencyKey: 'retry-key-0001',
        title: 'Once',
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      };
      const first = await service.createTask(owner, T, 'p1', dto);
      const second = await service.createTask(owner, T, 'p1', { ...dto });
      expect(second).toEqual(first);
      expect(service.listTasks(owner, T, 'p1')).toHaveLength(1);
      expect(
        await code(
          service.createTask(owner, T, 'p1', { ...dto, title: 'Twice' }),
        ),
      ).toBe('BIZ_IDEMPOTENCY_KEY_REUSED');
    });

    it('scopes keys to the actor', async () => {
      const dto = {
        idempotencyKey: 'shared-key-0001',
        title: 'x',
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      };
      const a = await service.createTask(owner, T, 'p1', dto);
      const b = await service.createTask(planner, T, 'p1', dto);
      expect(a.id).not.toBe(b.id);
    });

    it('creates one task from many simultaneous identical requests', async () => {
      const dto = {
        idempotencyKey: 'burst-key-0001',
        title: 'Burst',
        startDate: '2027-01-01',
        endDate: '2027-01-02',
      };
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          service.createTask(owner, T, 'p1', dto),
        ),
      );
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(service.listTasks(owner, T, 'p1')).toHaveLength(1);
    });

    it('lets exactly one of two simultaneous edits of the same version win', async () => {
      const a = await create(owner);
      const results = await Promise.allSettled([
        update(owner, a.id, 1, { title: 'one' }),
        update(planner, a.id, 1, { title: 'two' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ errorCode: 'BIZ_SCHEDULE_STALE_VERSION' });
      expect(service.getTask(owner, T, a.id).version).toBe(2);
    });

    it('cannot be tricked into a cycle by two simultaneous opposite edits', async () => {
      const a = await create(owner);
      const b = await create(owner);
      const results = await Promise.allSettled([
        update(owner, a.id, 1, { dependsOn: [b.id] }),
        update(planner, b.id, 1, { dependsOn: [a.id] }),
      ]);
      const failed = results.filter((r) => r.status === 'rejected');
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
        errorCode: 'BIZ_SCHEDULE_DEPENDENCY_CYCLE',
      });
      expect(
        service.analyze(owner, T, 'p1', '2027-01-01').findings,
      ).not.toContainEqual(
        expect.objectContaining({ type: 'dependency_cycle' }),
      );
    });
  });

  describe('analysis', () => {
    it('surfaces dates, conflicts, blocked critical path and deadline risk', async () => {
      const a = await create(owner, { assigneeId: 'u1' });
      const b = await create(owner, {
        dependsOn: [a.id],
        startDate: '2027-01-03',
        endDate: '2027-01-20',
        assigneeId: 'u1',
      });
      const c = await create(owner, {
        dependsOn: [b.id],
        startDate: '2027-01-21',
        endDate: '2027-01-29',
      });
      await move(owner, b.id, 1, TaskStatus.BLOCKED);
      const result = service.analyze(owner, T, 'p1', '2027-01-01');
      const types = result.findings.map((f) => `${f.type}:${f.code}`);
      expect(types).toEqual(
        expect.arrayContaining([
          'impossible_dates:START_BEFORE_PREDECESSOR_END',
          'resource_conflict:ASSIGNEE_OVERLAP',
          'blocked_critical_path:BLOCKED_ON_CRITICAL_PATH',
        ]),
      );
      expect(result.criticalPath).toEqual([a.id, b.id, c.id]);
      expect(result.deadlineStatus).toBe('at_risk');
    });

    it('does not leak assignee ids or titles to viewers', async () => {
      await create(owner, { assigneeId: 'person-9' });
      await create(owner, { assigneeId: 'person-9' });
      const forViewer = JSON.stringify(
        service.analyze(viewer, T, 'p1', '2027-01-01'),
      );
      const forOwner = JSON.stringify(
        service.analyze(owner, T, 'p1', '2027-01-01'),
      );
      expect(forViewer).not.toContain('person-9');
      expect(forOwner).toContain('person-9');
      expect(forOwner).not.toContain('Secret title');
    });

    it('rejects an invalid analysis date', () => {
      expect(() => service.analyze(owner, T, 'p1', 'tomorrow-ish')).toThrow(
        expect.objectContaining({ errorCode: 'VAL_SCHEDULE_DATES_INVALID' }),
      );
    });
  });

  describe('snapshots and notifications', () => {
    const lateScenario = async () => {
      const a = await create(owner, {
        startDate: '2027-01-01',
        endDate: '2027-01-10',
      });
      await create(owner, {
        dependsOn: [a.id],
        startDate: '2027-01-11',
        endDate: '2027-02-20',
      });
    };

    it('notifies each finding once across snapshots', async () => {
      const events: ScheduleRiskEvent[] = [];
      build({
        notify: (e) => {
          events.push(e);
          return Promise.resolve();
        },
      });
      await lateScenario();
      const first = await service.takeSnapshot(owner, T, 'p1', {
        idempotencyKey: k(),
        asOf: '2027-01-01',
      });
      const second = await service.takeSnapshot(owner, T, 'p1', {
        idempotencyKey: k(),
        asOf: '2027-01-01',
      });
      expect(first.newlyNotified).toBe(1);
      expect(second.newlyNotified).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'deadline_risk',
        severity: 'critical',
      });
      expect(JSON.stringify(events)).not.toContain('Secret title');
      expect(service.listSnapshots(viewer, T, 'p1')).toHaveLength(2);
    });

    it('does not renotify when a snapshot request is retried', async () => {
      const notify = jest.fn().mockResolvedValue(undefined);
      build({ notify });
      await lateScenario();
      const dto = { idempotencyKey: 'snapshot-key-1', asOf: '2027-01-01' };
      await Promise.all([
        service.takeSnapshot(owner, T, 'p1', dto),
        service.takeSnapshot(owner, T, 'p1', dto),
        service.takeSnapshot(owner, T, 'p1', dto),
      ]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(service.listSnapshots(owner, T, 'p1')).toHaveLength(1);
    });

    it('survives a failing notifier and retries on the next snapshot', async () => {
      const notify = jest
        .fn()
        .mockRejectedValueOnce(new Error('smtp down'))
        .mockResolvedValue(undefined);
      build({ notify });
      await lateScenario();
      const first = await service.takeSnapshot(owner, T, 'p1', {
        idempotencyKey: k(),
        asOf: '2027-01-01',
      });
      expect(first).toMatchObject({ newlyNotified: 0, notificationsFailed: 1 });
      const second = await service.takeSnapshot(owner, T, 'p1', {
        idempotencyKey: k(),
        asOf: '2027-01-01',
      });
      expect(second).toMatchObject({
        newlyNotified: 1,
        notificationsFailed: 0,
      });
    });

    it('records snapshots without a notifier', async () => {
      await lateScenario();
      const snap = await service.takeSnapshot(owner, T, 'p1', {
        idempotencyKey: k(),
        asOf: '2027-01-01',
      });
      expect(snap).toMatchObject({ newlyNotified: 0, deadlineStatus: 'late' });
      expect(snap.findingCounts.critical).toBe(1);
    });
  });

  describe('audit', () => {
    it('records metadata only, including denied and failed attempts', async () => {
      const a = await create(owner, { assigneeId: 'person-9' });
      await code(create(viewer));
      await code(update(owner, a.id, 99));
      const entries = service.getAudit(admin, T);
      expect(entries.map((e) => e.outcome)).toEqual([
        'success',
        'denied',
        'failed',
      ]);
      const dump = JSON.stringify(entries);
      expect(dump).not.toContain('Secret title');
      expect(dump).not.toContain('person-9');
      expect(dump).not.toContain('2027-01-01');
      expect(
        service.getAudit(actor('admin-1', 'admin', 'tenant-b'), 'tenant-b'),
      ).toEqual([]);
    });
  });
});
