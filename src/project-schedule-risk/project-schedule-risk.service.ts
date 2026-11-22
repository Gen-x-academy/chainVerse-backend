import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  CreateTaskDto,
  TakeSnapshotDto,
  TransitionTaskDto,
  UpdateTaskDto,
} from './dto/project-schedule-risk.dto';
import { ScheduleAuditService } from './project-schedule-risk-audit.service';
import { ProjectScheduleRiskRepository } from './project-schedule-risk.repository';
import { analyzeSchedule, toDay } from './schedule-analyzer';
import {
  ALLOWED_TASK_TRANSITIONS,
  AnalysisSnapshot,
  FindingSeverity,
  MAX_DEPENDENCIES_PER_TASK,
  MAX_SNAPSHOTS_PER_PROJECT,
  MAX_TASKS_PER_PROJECT,
  SCHEDULE_ADMIN_ROLES,
  SCHEDULE_MANAGE_ROLES,
  SCHEDULE_RISK_NOTIFIER,
  ScheduleActor,
  ScheduleAnalysis,
  ScheduleProjectRole,
  ScheduleProjectStub,
  TERMINAL_TASK_STATUSES,
  TaskRecord,
  TaskStatus,
  TaskView,
} from './project-schedule-risk.types';

import type { ScheduleRiskNotifier } from './project-schedule-risk.types';

type Access = 'admin' | ScheduleProjectRole;

@Injectable()
export class ProjectScheduleRiskService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  /** Serialises state-changing work per tenant so check-then-write sequences are atomic. */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ProjectScheduleRiskRepository,
    private readonly audit: ScheduleAuditService,
    @Optional()
    @Inject(SCHEDULE_RISK_NOTIFIER)
    private readonly notifier?: ScheduleRiskNotifier,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  registerProject(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    stub: Pick<ScheduleProjectStub, 'id' | 'members'> & {
      deadline?: string | null;
    },
  ): void {
    const actor = this.assertActor(actorInput, tenantId);
    if (!stub.id?.trim()) {
      throw new ValidationDomainException('projectId is required');
    }
    for (const [userId, role] of Object.entries(stub.members ?? {})) {
      if (
        !userId.trim() ||
        !Object.values(ScheduleProjectRole).includes(role)
      ) {
        throw new ValidationDomainException(
          'members must be a map of user IDs to valid project roles',
        );
      }
    }
    const deadline = stub.deadline ? this.parseDate(stub.deadline) : null;
    const existing = this.repository.getProject(tenantId, stub.id);
    if (existing) {
      this.assertCanManage(this.accessOf(existing, actor));
    } else if (!this.isPlatformAdmin(actor)) {
      throw this.denied();
    }
    this.repository.upsertProject({
      id: stub.id,
      tenantId,
      members: { ...(stub.members ?? {}) },
      deadline,
    });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createTask(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreateTaskDto,
  ): Promise<TaskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `task.create:${projectId}`,
      dto,
      (actor) => {
        const project = this.requireProject(tenantId, projectId);
        const access = this.accessOf(project, actor);
        this.assertCanManage(access);
        const siblings = this.repository.tasksForProject(tenantId, projectId);
        if (siblings.length >= MAX_TASKS_PER_PROJECT) {
          throw new BusinessRuleException(
            `A project may have at most ${MAX_TASKS_PER_PROJECT} tasks`,
            ErrorCode.BIZ_SCHEDULE_LIMIT_EXCEEDED,
          );
        }
        const { startDate, endDate } = this.validateDates(
          dto.startDate,
          dto.endDate,
        );
        const dependsOn = this.validateDependencies(
          siblings,
          null,
          dto.dependsOn ?? [],
        );
        const now = new Date().toISOString();
        const record: TaskRecord = {
          id: this.repository.newId(),
          tenantId,
          projectId,
          version: 1,
          title: dto.title.trim(),
          assigneeId: dto.assigneeId?.trim() || null,
          startDate,
          endDate,
          dependsOn,
          status: TaskStatus.PLANNED,
          createdBy: actor.actorId,
          createdAt: now,
          updatedAt: now,
        };
        this.repository.putTask(record);
        return this.view(record, access);
      },
    );
  }

  async updateTask(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `task.update:${taskId}`,
      dto,
      (actor) => {
        const { record, access } = this.requireManaged(tenantId, taskId, actor);
        this.assertVersion(record, dto.expectedVersion);
        if (TERMINAL_TASK_STATUSES.includes(record.status)) {
          throw new BusinessRuleException(
            `A ${record.status} task can no longer be edited`,
            ErrorCode.BIZ_SCHEDULE_TASK_CLOSED,
          );
        }
        const { startDate, endDate } = this.validateDates(
          dto.startDate ?? record.startDate,
          dto.endDate ?? record.endDate,
        );
        const siblings = this.repository.tasksForProject(
          tenantId,
          record.projectId,
        );
        const dependsOn =
          dto.dependsOn === undefined
            ? record.dependsOn
            : this.validateDependencies(siblings, record.id, dto.dependsOn);
        const updated: TaskRecord = {
          ...record,
          title: dto.title?.trim() ?? record.title,
          assigneeId:
            dto.assigneeId === undefined
              ? record.assigneeId
              : dto.assigneeId?.trim() || null,
          startDate,
          endDate,
          dependsOn,
          version: record.version + 1,
          updatedAt: new Date().toISOString(),
        };
        this.repository.putTask(updated);
        return this.view(updated, access);
      },
    );
  }

  async transitionTask(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    taskId: string,
    dto: TransitionTaskDto,
  ): Promise<TaskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `task.transition:${taskId}`,
      dto,
      (actor) => {
        const { record, access } = this.requireManaged(tenantId, taskId, actor);
        this.assertVersion(record, dto.expectedVersion);
        if (!ALLOWED_TASK_TRANSITIONS[record.status].includes(dto.status)) {
          throw new BusinessRuleException(
            `Cannot move a ${record.status} task to ${dto.status}`,
            ErrorCode.BIZ_SCHEDULE_INVALID_TRANSITION,
            { from: record.status, to: dto.status },
          );
        }
        if (
          dto.status === TaskStatus.IN_PROGRESS ||
          dto.status === TaskStatus.DONE
        ) {
          this.assertPredecessorsClosed(tenantId, record);
        }
        const updated: TaskRecord = {
          ...record,
          status: dto.status,
          version: record.version + 1,
          updatedAt: new Date().toISOString(),
        };
        this.repository.putTask(updated);
        return this.view(updated, access);
      },
    );
  }

  /**
   * Computes the current analysis, persists a metadata-only snapshot and
   * notifies each high/critical finding at most once per project (a failed
   * notification stays eligible for the next snapshot).
   */
  async takeSnapshot(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    projectId: string,
    dto: TakeSnapshotDto,
  ): Promise<AnalysisSnapshot> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `snapshot.create:${projectId}`,
      dto,
      async (actor) => {
        const project = this.requireProject(tenantId, projectId);
        this.assertCanManage(this.accessOf(project, actor));
        const analysis = this.compute(project, dto.asOf, false);
        const counts: Record<FindingSeverity, number> = {
          critical: 0,
          high: 0,
          medium: 0,
        };
        let newlyNotified = 0;
        let notificationsFailed = 0;
        const notified = this.repository.notifiedKeys(tenantId, projectId);
        for (const finding of analysis.findings) {
          counts[finding.severity]++;
          if (
            !this.notifier ||
            finding.severity === 'medium' ||
            notified.has(finding.key)
          ) {
            continue;
          }
          try {
            await this.notifier.notify({
              tenantId,
              projectId,
              type: finding.type,
              code: finding.code,
              severity: finding.severity,
              taskIds: [...finding.taskIds],
            });
            notified.add(finding.key);
            newlyNotified++;
          } catch {
            notificationsFailed++;
          }
        }
        const snapshot: AnalysisSnapshot = {
          id: this.repository.newId(),
          projectId,
          takenAt: new Date().toISOString(),
          asOf: analysis.asOf,
          deadlineStatus: analysis.deadlineStatus,
          marginDays: analysis.marginDays,
          findingCounts: counts,
          newlyNotified,
          notificationsFailed,
        };
        this.repository.addSnapshot(
          tenantId,
          projectId,
          snapshot,
          MAX_SNAPSHOTS_PER_PROJECT,
        );
        return snapshot;
      },
    );
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  getTask(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    taskId: string,
  ): TaskView {
    const actor = this.assertActor(actorInput, tenantId);
    const record = this.requireTask(tenantId, taskId);
    const project = this.requireProject(tenantId, record.projectId);
    return this.view(record, this.accessOf(project, actor));
  }

  listTasks(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    projectId: string,
  ): TaskView[] {
    const actor = this.assertActor(actorInput, tenantId);
    const project = this.requireProject(tenantId, projectId);
    const access = this.accessOf(project, actor);
    return this.repository
      .tasksForProject(tenantId, projectId)
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
      )
      .map((t) => this.view(t, access));
  }

  analyze(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    projectId: string,
    asOf?: string,
  ): ScheduleAnalysis {
    const actor = this.assertActor(actorInput, tenantId);
    const project = this.requireProject(tenantId, projectId);
    const access = this.accessOf(project, actor);
    return this.compute(project, asOf, this.canManage(access));
  }

  listSnapshots(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    projectId: string,
  ): AnalysisSnapshot[] {
    const actor = this.assertActor(actorInput, tenantId);
    const project = this.requireProject(tenantId, projectId);
    this.accessOf(project, actor);
    return this.repository.snapshotsFor(tenantId, projectId);
  }

  getAudit(actorInput: ScheduleActor | undefined, tenantId: string) {
    const actor = this.assertActor(actorInput, tenantId);
    if (!this.isPlatformAdmin(actor)) throw this.denied();
    return this.audit.snapshot(tenantId);
  }

  // ── Domain helpers ────────────────────────────────────────────────────────

  private compute(
    project: ScheduleProjectStub,
    asOf: string | undefined,
    includeAssignees: boolean,
  ): ScheduleAnalysis {
    return analyzeSchedule({
      tasks: this.repository.tasksForProject(project.tenantId, project.id),
      deadline: project.deadline,
      asOf: asOf ? this.parseDate(asOf) : new Date().toISOString().slice(0, 10),
      includeAssignees,
    });
  }

  private parseDate(value: string): string {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
      throw new ValidationDomainException(
        'Dates must be valid ISO-8601 dates',
        ErrorCode.VAL_SCHEDULE_DATES_INVALID,
      );
    }
    return new Date(ms).toISOString().slice(0, 10);
  }

  private validateDates(start: string, end: string) {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);
    if (toDay(endDate) < toDay(startDate)) {
      throw new ValidationDomainException(
        'endDate must not be before startDate',
        ErrorCode.VAL_SCHEDULE_DATES_INVALID,
      );
    }
    return { startDate, endDate };
  }

  /**
   * Dependencies must exist in the same project, stay within the size limit and
   * must not create a cycle (a task reaching itself through its predecessors).
   */
  private validateDependencies(
    siblings: TaskRecord[],
    taskId: string | null,
    requested: string[],
  ): string[] {
    const deps = [...new Set(requested)];
    if (deps.length > MAX_DEPENDENCIES_PER_TASK) {
      throw new BusinessRuleException(
        `A task may have at most ${MAX_DEPENDENCIES_PER_TASK} dependencies`,
        ErrorCode.BIZ_SCHEDULE_LIMIT_EXCEEDED,
      );
    }
    const byId = new Map(siblings.map((t) => [t.id, t]));
    const unknown = deps.filter((id) => id !== taskId && !byId.has(id));
    if (unknown.length) {
      throw new BusinessRuleException(
        'Dependencies must be tasks in the same project',
        ErrorCode.BIZ_SCHEDULE_DEPENDENCY_UNKNOWN,
        { unknownDependencyIds: unknown },
      );
    }
    if (taskId) {
      const stack = deps.map((id) => ({ id, path: [id] }));
      const seen = new Set<string>();
      while (stack.length) {
        const { id, path } = stack.pop()!;
        if (id === taskId) {
          throw new BusinessRuleException(
            'Dependency would create a cycle',
            ErrorCode.BIZ_SCHEDULE_DEPENDENCY_CYCLE,
            { cycle: [taskId, ...path] },
          );
        }
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of byId.get(id)?.dependsOn ?? []) {
          stack.push({ id: next, path: [...path, next] });
        }
      }
    }
    return deps;
  }

  private assertPredecessorsClosed(tenantId: string, record: TaskRecord): void {
    const open = record.dependsOn.filter((id) => {
      const dep = this.repository.getTask(tenantId, id);
      return (
        dep &&
        dep.status !== TaskStatus.DONE &&
        dep.status !== TaskStatus.CANCELLED
      );
    });
    if (open.length) {
      throw new BusinessRuleException(
        'Predecessor tasks must be done or cancelled first',
        ErrorCode.BIZ_SCHEDULE_PREDECESSORS_OPEN,
        { openPredecessorIds: open },
      );
    }
  }

  private assertVersion(record: TaskRecord, expected: number): void {
    if (record.version !== expected) {
      throw new ResourceConflictException(
        'Task was modified; reload and retry',
        ErrorCode.BIZ_SCHEDULE_STALE_VERSION,
        { currentVersion: record.version },
      );
    }
  }

  // ── Authorization ─────────────────────────────────────────────────────────

  /** Members and platform admins only; everyone else sees "not found". */
  private accessOf(project: ScheduleProjectStub, actor: ScheduleActor): Access {
    if (this.isPlatformAdmin(actor)) return 'admin';
    const role = project.members[actor.actorId];
    if (!role) {
      throw new ResourceNotFoundException(
        'Project not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return role;
  }

  private canManage(access: Access): boolean {
    return (
      access === 'admin' ||
      (SCHEDULE_MANAGE_ROLES as readonly string[]).includes(access)
    );
  }

  private assertCanManage(access: Access): void {
    if (!this.canManage(access)) throw this.denied();
  }

  private requireManaged(
    tenantId: string,
    taskId: string,
    actor: ScheduleActor,
  ): { record: TaskRecord; access: Access } {
    const record = this.requireTask(tenantId, taskId);
    const project = this.requireProject(tenantId, record.projectId);
    const access = this.accessOf(project, actor);
    this.assertCanManage(access);
    return { record, access };
  }

  private requireProject(
    tenantId: string,
    projectId: string,
  ): ScheduleProjectStub {
    const project = this.repository.getProject(tenantId, projectId);
    if (!project) {
      throw new ResourceNotFoundException(
        'Project not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return project;
  }

  private requireTask(tenantId: string, taskId: string): TaskRecord {
    const record = this.repository.getTask(tenantId, taskId);
    if (!record) {
      throw new ResourceNotFoundException(
        'Task not found',
        ErrorCode.RES_SCHEDULE_TASK_NOT_FOUND,
      );
    }
    return record;
  }

  private assertActor(
    actor: ScheduleActor | undefined,
    tenantId: string,
  ): ScheduleActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim() ||
      actor.tenantId !== tenantId
    ) {
      throw this.denied();
    }
    return actor;
  }

  private isPlatformAdmin(actor: ScheduleActor): boolean {
    return actor.roles.some((r) =>
      (SCHEDULE_ADMIN_ROLES as readonly string[]).includes(r),
    );
  }

  private denied(): ForbiddenDomainException {
    return new ForbiddenDomainException(
      'Schedule access denied',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  private view(record: TaskRecord, access: Access): TaskView {
    return {
      id: record.id,
      projectId: record.projectId,
      version: record.version,
      title: record.title,
      ...(this.canManage(access) ? { assigneeId: record.assigneeId } : {}),
      assigned: record.assigneeId !== null,
      startDate: record.startDate,
      endDate: record.endDate,
      dependsOn: [...record.dependsOn],
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  // ── Idempotency and serialisation ─────────────────────────────────────────

  private async runIdempotent<T>(
    actorInput: ScheduleActor | undefined,
    tenantId: string,
    operation: string,
    payload: { idempotencyKey: string },
    work: (actor: ScheduleActor) => T | Promise<T>,
  ): Promise<T> {
    const actor = this.assertActor(actorInput, tenantId);
    const requestHash = hash(
      `${tenantId}|${actor.actorId}|${operation}|${payload.idempotencyKey}`,
    );
    const fingerprint = hash(stableStringify(payload));
    const release = await this.acquire(tenantId);
    try {
      const cached = this.idempotency.get(requestHash);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new ResourceConflictException(
            'Idempotency key reused with a different payload',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return clone(cached.response) as T;
      }
      let response: T;
      try {
        response = await work(actor);
      } catch (error) {
        this.audit.record({
          action: operation,
          tenantId,
          actorId: actor.actorId,
          actorRoles: actor.roles,
          resourceType: operation.split('.')[0],
          resourceId: '',
          outcome:
            error instanceof ForbiddenDomainException ? 'denied' : 'failed',
          fingerprint,
          requestHash,
        });
        throw error;
      }
      this.idempotency.set(requestHash, {
        fingerprint,
        response: clone(response),
      });
      this.audit.record({
        action: operation,
        tenantId,
        actorId: actor.actorId,
        actorRoles: actor.roles,
        resourceType: operation.split('.')[0],
        resourceId: resourceIdOf(response),
        fingerprint,
        requestHash,
      });
      return response;
    } finally {
      release();
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.tenantLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.tenantLocks.set(key, tail);
    await previous;
    return () => {
      release();
      if (this.tenantLocks.get(key) === tail) this.tenantLocks.delete(key);
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceIdOf(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) {
    return String(value.id);
  }
  return '';
}
