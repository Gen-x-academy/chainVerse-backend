import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { WorkBreakdownAuditService } from './work-breakdown-audit.service';
import { WorkBreakdownRepository } from './work-breakdown.repository';
import {
  AddDependencyDto,
  AdvancePackageStatusDto,
  AssignRoleDto,
  CreateTaskDto,
  CreateWbsDto,
  CreateWorkPackageDto,
  SetEstimateDto,
  UpdateTaskDto,
  UpdateWbsDto,
  UpdateWorkPackageDto,
  WbsMutationDto,
} from './dto/work-breakdown.dto';
import {
  DependencyRecord,
  DependencyView,
  EstimateView,
  PackageStatus,
  TERMINAL_STATUSES,
  VALID_STATUS_TRANSITIONS,
  WbsActor,
  WbsProgressReport,
  WbsRecord,
  WbsRole,
  WbsView,
  WorkPackageRecord,
  WorkPackageView,
  TaskRecord,
  TaskView,
} from './work-breakdown.types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Platform roles that can create WBS structures. */
const PLATFORM_MANAGE_ROLES = ['admin', 'moderator', 'tutor'];

/** Package-level roles that allow mutation. */
const PACKAGE_MANAGE_ROLES: WbsRole[] = [
  WbsRole.OWNER,
  WbsRole.PLANNER,
  WbsRole.EXECUTOR,
];

/** Package-level roles that allow status transitions. */
const PACKAGE_STATUS_ROLES: WbsRole[] = [
  WbsRole.OWNER,
  WbsRole.PLANNER,
  WbsRole.EXECUTOR,
  WbsRole.REVIEWER,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${k}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceIdOf(response: unknown): string {
  if (response && typeof response === 'object' && 'id' in response) {
    return String((response as Record<string, unknown>)['id']);
  }
  return 'unknown';
}

function now(): string {
  return new Date().toISOString();
}

// ── View mappers ──────────────────────────────────────────────────────────────

function wbsView(record: WbsRecord): WbsView {
  return {
    id: record.id,
    projectId: record.projectId,
    title: record.title,
    description: record.description,
    orderedPackages: [...record.orderedPackages],
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function packageView(record: WorkPackageRecord): WorkPackageView {
  return {
    id: record.id,
    wbsId: record.wbsId,
    projectId: record.projectId,
    order: record.order,
    title: record.title,
    description: record.description,
    status: record.status,
    dependsOn: [...record.dependsOn],
    assignees: [...record.assignees],
    estimate: record.estimate ? (record.estimate as EstimateView) : null,
    acceptanceCriteria: [...record.acceptanceCriteria],
    progressWeight: record.progressWeight,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function taskView(record: TaskRecord): TaskView {
  return {
    id: record.id,
    packageId: record.packageId,
    wbsId: record.wbsId,
    projectId: record.projectId,
    title: record.title,
    done: record.done,
    assigneeId: record.assigneeId,
    dueAt: record.dueAt,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function dependencyView(record: DependencyRecord): DependencyView {
  return {
    id: record.id,
    wbsId: record.wbsId,
    fromPackageId: record.fromPackageId,
    toPackageId: record.toPackageId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
}

// ── Cycle detection ───────────────────────────────────────────────────────────

/**
 * Returns true if adding an edge from→to would create a cycle in the
 * dependency graph of the given WBS.
 */
function wouldCreateCycle(
  packages: readonly WorkPackageRecord[],
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;
  // BFS from `toId` following dependsOn edges; if we reach `fromId`, it's a cycle.
  const visited = new Set<string>();
  const queue = [toId];
  const dependsOnMap = new Map<string, string[]>(
    packages.map((p) => [p.id, p.dependsOn]),
  );
  while (queue.length) {
    const current = queue.shift()!;
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = dependsOnMap.get(current) ?? [];
    queue.push(...deps);
  }
  return false;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WorkBreakdownService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: WorkBreakdownRepository,
    private readonly audit: WorkBreakdownAuditService,
  ) {}

  // ── WBS CRUD ──────────────────────────────────────────────────────────────

  async createWbs(
    actorInput: WbsActor | undefined,
    tenantId: string,
    dto: CreateWbsDto,
  ): Promise<WbsView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `wbs.create:${dto.projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        this.assertPlatformManager(actor);
        const ts = now();
        const record = this.repository.putWbs({
          id: this.repository.newId(),
          tenantId,
          projectId: dto.projectId.trim(),
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          orderedPackages: [],
          createdBy: actor.actorId,
          createdAt: ts,
          updatedAt: ts,
        });
        return wbsView(record);
      },
    );
  }

  async listWbs(
    actorInput: WbsActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<WbsView[]> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    return this.repository
      .wbsByProject(tenantId, projectId)
      .map(wbsView);
  }

  async getWbs(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
  ): Promise<WbsView> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    const record = this.requireWbs(tenantId, wbsId);
    return wbsView(record);
  }

  async updateWbs(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
    dto: UpdateWbsDto,
  ): Promise<WbsView> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.assertPlatformManager(actor);
    const record = this.requireWbs(tenantId, wbsId);

    // Validate orderedPackages covers exactly all packages in the WBS.
    if (dto.orderedPackages !== undefined) {
      const existing = this.repository
        .packagesForWbs(tenantId, wbsId)
        .map((p) => p.id);
      const incoming = [...dto.orderedPackages];
      if (
        incoming.length !== existing.length ||
        !existing.every((id) => incoming.includes(id))
      ) {
        throw new ValidationDomainException(
          'orderedPackages must reference exactly all existing packages in this WBS',
          ErrorCode.VAL_INVALID_INPUT,
        );
      }
      record.orderedPackages = incoming;
    }

    if (dto.title !== undefined) record.title = dto.title.trim();
    if (dto.description !== undefined)
      record.description = dto.description?.trim() ?? null;
    record.updatedAt = now();
    this.repository.replaceWbs(record);
    return wbsView(record);
  }

  // ── Work Package CRUD ─────────────────────────────────────────────────────

  async createPackage(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
    dto: CreateWorkPackageDto,
  ): Promise<WorkPackageView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `package.create:${wbsId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        this.assertPlatformManager(actor);
        const wbs = this.requireWbs(tenantId, wbsId);

        // Validate declared dependencies exist in the same WBS.
        const declared = dto.dependsOn ?? [];
        for (const depId of declared) {
          const dep = this.repository.getPackage(tenantId, depId);
          if (!dep || dep.wbsId !== wbsId) {
            throw new ValidationDomainException(
              `Dependency package ${depId} does not exist in this WBS`,
              ErrorCode.VAL_INVALID_INPUT,
            );
          }
        }

        const existing = this.repository.packagesForWbs(tenantId, wbsId);
        const order = existing.length + 1;
        const ts = now();
        const record = this.repository.putPackage({
          id: this.repository.newId(),
          tenantId,
          wbsId,
          projectId: wbs.projectId,
          order,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          status: PackageStatus.PENDING,
          dependsOn: declared,
          assignees: dto.assignees ?? [],
          estimate: null,
          acceptanceCriteria: dto.acceptanceCriteria ?? [],
          progressWeight: dto.progressWeight ?? 1,
          roles: { [actor.actorId]: WbsRole.OWNER },
          idempotencyKey: null,
          createdBy: actor.actorId,
          createdAt: ts,
          updatedAt: ts,
        });

        // Append to the WBS ordered list.
        wbs.orderedPackages.push(record.id);
        wbs.updatedAt = ts;
        this.repository.replaceWbs(wbs);

        return packageView(record);
      },
    );
  }

  async listPackages(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
  ): Promise<WorkPackageView[]> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    this.requireWbs(tenantId, wbsId);
    return this.repository
      .packagesForWbs(tenantId, wbsId)
      .map(packageView);
  }

  async getPackage(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
  ): Promise<WorkPackageView> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    const record = this.requirePackage(tenantId, packageId);
    return packageView(record);
  }

  async updatePackage(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
    dto: UpdateWorkPackageDto,
  ): Promise<WorkPackageView> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    const record = this.requirePackage(tenantId, packageId);
    this.assertPackageRole(record, actor.actorId, PACKAGE_MANAGE_ROLES, actor);

    if (TERMINAL_STATUSES.includes(record.status)) {
      throw new BusinessRuleException(
        'Cannot update a package in a terminal state',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    if (dto.title !== undefined) record.title = dto.title.trim();
    if (dto.description !== undefined)
      record.description = dto.description?.trim() ?? null;
    if (dto.assignees !== undefined) record.assignees = dto.assignees;
    if (dto.acceptanceCriteria !== undefined)
      record.acceptanceCriteria = dto.acceptanceCriteria;
    if (dto.progressWeight !== undefined)
      record.progressWeight = dto.progressWeight;
    record.updatedAt = now();
    this.repository.replacePackage(record);
    return packageView(record);
  }

  // ── Status transition ─────────────────────────────────────────────────────

  async advanceStatus(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
    dto: AdvancePackageStatusDto,
  ): Promise<WorkPackageView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `package.status:${packageId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.requirePackage(tenantId, packageId);
        this.assertPackageRole(
          record,
          actor.actorId,
          PACKAGE_STATUS_ROLES,
          actor,
        );

        const allowed = VALID_STATUS_TRANSITIONS[record.status];
        if (!allowed.includes(dto.status)) {
          throw new BusinessRuleException(
            `Cannot transition from ${record.status} to ${dto.status}`,
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
            { from: record.status, to: dto.status, allowed },
          );
        }

        // Require a blockerNote when moving to BLOCKED.
        if (dto.status === PackageStatus.BLOCKED && !dto.blockerNote?.trim()) {
          throw new ValidationDomainException(
            'A blockerNote is required when setting status to BLOCKED',
          );
        }

        // Ensure all dependencies are DONE before the package can be DONE.
        if (dto.status === PackageStatus.DONE) {
          for (const depId of record.dependsOn) {
            const dep = this.repository.getPackage(tenantId, depId);
            if (!dep || dep.status !== PackageStatus.DONE) {
              throw new BusinessRuleException(
                `Dependency package ${depId} must be DONE before this package can be completed`,
                ErrorCode.BIZ_INVALID_STATE_TRANSITION,
                { blockingDependency: depId },
              );
            }
          }
        }

        record.status = dto.status;
        record.updatedAt = now();
        this.repository.replacePackage(record);
        return packageView(record);
      },
    );
  }

  // ── Estimate ──────────────────────────────────────────────────────────────

  async setEstimate(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
    dto: SetEstimateDto,
  ): Promise<WorkPackageView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `package.estimate:${packageId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.requirePackage(tenantId, packageId);
        this.assertPackageRole(record, actor.actorId, PACKAGE_MANAGE_ROLES, actor);

        if (TERMINAL_STATUSES.includes(record.status)) {
          throw new BusinessRuleException(
            'Cannot set an estimate on a completed or cancelled package',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }

        record.estimate = {
          value: dto.value,
          unit: dto.unit,
          addedBy: actor.actorId,
          addedAt: now(),
        };
        record.updatedAt = now();
        this.repository.replacePackage(record);
        return packageView(record);
      },
    );
  }

  // ── Role assignment ───────────────────────────────────────────────────────

  async assignRole(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
    dto: AssignRoleDto,
  ): Promise<WorkPackageView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `package.role.assign:${packageId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.requirePackage(tenantId, packageId);
        this.assertPackageRole(record, actor.actorId, [WbsRole.OWNER], actor);

        record.roles[dto.userId] = dto.role;
        record.updatedAt = now();
        this.repository.replacePackage(record);
        return packageView(record);
      },
    );
  }

  // ── Dependencies ─────────────────────────────────────────────────────────

  async addDependency(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
    dto: AddDependencyDto,
  ): Promise<DependencyView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `dependency.add:${wbsId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        this.assertPlatformManager(actor);
        this.requireWbs(tenantId, wbsId);

        const fromPkg = this.repository.getPackage(tenantId, dto.fromPackageId);
        const toPkg = this.repository.getPackage(tenantId, dto.toPackageId);

        if (!fromPkg || fromPkg.wbsId !== wbsId) {
          throw new ResourceNotFoundException(
            `fromPackageId ${dto.fromPackageId} not found in this WBS`,
          );
        }
        if (!toPkg || toPkg.wbsId !== wbsId) {
          throw new ResourceNotFoundException(
            `toPackageId ${dto.toPackageId} not found in this WBS`,
          );
        }
        if (dto.fromPackageId === dto.toPackageId) {
          throw new ValidationDomainException(
            'A package cannot depend on itself',
          );
        }

        // Check for existing duplicate dependency.
        const allPackages = this.repository.packagesForWbs(tenantId, wbsId);
        const existing = this.repository.dependenciesForWbs(tenantId, wbsId);
        const duplicate = existing.find(
          (d) =>
            d.fromPackageId === dto.fromPackageId &&
            d.toPackageId === dto.toPackageId,
        );
        if (duplicate) {
          throw new ResourceConflictException(
            'This dependency already exists',
            ErrorCode.RES_ALREADY_EXISTS,
          );
        }

        // Cycle detection — walk the dependency graph.
        if (wouldCreateCycle(allPackages, dto.fromPackageId, dto.toPackageId)) {
          throw new BusinessRuleException(
            'Adding this dependency would create a circular dependency cycle',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }

        // Record edge on the package's dependsOn list.
        if (!toPkg.dependsOn.includes(dto.fromPackageId)) {
          toPkg.dependsOn.push(dto.fromPackageId);
          this.repository.replacePackage(toPkg);
        }

        const record = this.repository.putDependency({
          id: this.repository.newId(),
          tenantId,
          wbsId,
          fromPackageId: dto.fromPackageId,
          toPackageId: dto.toPackageId,
          createdBy: actor.actorId,
          createdAt: now(),
        });
        return dependencyView(record);
      },
    );
  }

  async listDependencies(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
  ): Promise<DependencyView[]> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    this.requireWbs(tenantId, wbsId);
    return this.repository
      .dependenciesForWbs(tenantId, wbsId)
      .map(dependencyView);
  }

  async removeDependency(
    actorInput: WbsActor | undefined,
    tenantId: string,
    dependencyId: string,
  ): Promise<{ removed: boolean }> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.assertPlatformManager(actor);
    const dep = this.repository.getDependency(tenantId, dependencyId);
    if (!dep) {
      throw new ResourceNotFoundException('Dependency not found');
    }
    // Remove from the package's dependsOn list.
    const toPkg = this.repository.getPackage(tenantId, dep.toPackageId);
    if (toPkg) {
      toPkg.dependsOn = toPkg.dependsOn.filter(
        (id) => id !== dep.fromPackageId,
      );
      toPkg.updatedAt = now();
      this.repository.replacePackage(toPkg);
    }
    this.repository.removeDependency(tenantId, dependencyId);
    return { removed: true };
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async createTask(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
    dto: CreateTaskDto,
  ): Promise<TaskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `task.create:${packageId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.requirePackage(tenantId, packageId);
        this.assertPackageRole(record, actor.actorId, PACKAGE_MANAGE_ROLES, actor);

        if (TERMINAL_STATUSES.includes(record.status)) {
          throw new BusinessRuleException(
            'Cannot add tasks to a package in a terminal state',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }

        const ts = now();
        const task = this.repository.putTask({
          id: this.repository.newId(),
          tenantId,
          packageId,
          wbsId: record.wbsId,
          projectId: record.projectId,
          title: dto.title.trim(),
          done: false,
          assigneeId: dto.assigneeId ?? null,
          dueAt: dto.dueAt ?? null,
          createdBy: actor.actorId,
          createdAt: ts,
          updatedAt: ts,
        });
        return taskView(task);
      },
    );
  }

  async listTasks(
    actorInput: WbsActor | undefined,
    tenantId: string,
    packageId: string,
  ): Promise<TaskView[]> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    this.requirePackage(tenantId, packageId);
    return this.repository
      .tasksForPackage(tenantId, packageId)
      .map(taskView);
  }

  async updateTask(
    actorInput: WbsActor | undefined,
    tenantId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskView> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    const task = this.requireTask(tenantId, taskId);
    const pkg = this.requirePackage(tenantId, task.packageId);
    this.assertPackageRole(pkg, actor.actorId, PACKAGE_MANAGE_ROLES, actor);

    if (dto.title !== undefined) task.title = dto.title.trim();
    if (dto.done !== undefined) task.done = dto.done;
    if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId ?? null;
    if (dto.dueAt !== undefined) task.dueAt = dto.dueAt ?? null;
    task.updatedAt = now();
    this.repository.replaceTask(task);
    return taskView(task);
  }

  // ── Progress report ───────────────────────────────────────────────────────

  async progressReport(
    actorInput: WbsActor | undefined,
    tenantId: string,
    wbsId: string,
  ): Promise<WbsProgressReport> {
    await Promise.resolve();
    this.assertActor(actorInput, tenantId);
    this.requireWbs(tenantId, wbsId);
    const packages = this.repository.packagesForWbs(tenantId, wbsId);
    const totalWeight = packages.reduce((s, p) => s + p.progressWeight, 0);
    const completedWeight = packages
      .filter((p) => p.status === PackageStatus.DONE)
      .reduce((s, p) => s + p.progressWeight, 0);
    const progressPercent =
      totalWeight === 0
        ? 0
        : Math.round((completedWeight / totalWeight) * 100);
    return {
      wbsId,
      totalWeight,
      completedWeight,
      progressPercent,
      packageBreakdown: packages.map((p) => ({
        packageId: p.id,
        title: p.title,
        status: p.status,
        progressWeight: p.progressWeight,
      })),
    };
  }

  // ── Idempotency + locking ─────────────────────────────────────────────────

  private async runIdempotent<T>(
    actorInput: WbsActor | undefined,
    tenantId: string,
    operation: string,
    payload: WbsMutationDto,
    work: () => T,
  ): Promise<T> {
    const actor = this.assertActor(actorInput, tenantId);
    const requestHash = hash(
      `${tenantId}|${actor.actorId}|${operation}|${payload.idempotencyKey}`,
    );
    const fingerprint = hash(stableStringify(payload));

    const previous = this.locks.get(requestHash) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(
      () => gate,
      () => gate,
    );
    this.locks.set(requestHash, tail);
    await previous.catch(() => undefined);

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

      const response = await work();
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
      if (this.locks.get(requestHash) === tail) {
        this.locks.delete(requestHash);
      }
    }
  }

  // ── Authorization helpers ─────────────────────────────────────────────────

  private assertActor(
    actor: WbsActor | undefined,
    tenantId: string,
  ): WbsActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim()
    ) {
      throw new ForbiddenDomainException(
        'WBS access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (actor.tenantId !== tenantId) {
      throw new ForbiddenDomainException(
        'Cross-tenant access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return actor;
  }

  private assertPlatformManager(actor: WbsActor): void {
    const hasPlatformRole = actor.roles.some((r) =>
      PLATFORM_MANAGE_ROLES.includes(r),
    );
    if (!hasPlatformRole) {
      throw new ForbiddenDomainException(
        'Only admins, moderators, or tutors may manage WBS structures',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  /**
   * Checks that actorId holds one of the required package-level roles.
   * Platform admins/moderators bypass this check.
   */
  private assertPackageRole(
    record: WorkPackageRecord,
    actorId: string,
    required: WbsRole[],
    actor: WbsActor,
  ): void {
    const isPlatformAdmin = actor.roles.some((r) =>
      PLATFORM_MANAGE_ROLES.includes(r),
    );
    if (isPlatformAdmin) return;
    const userRole = record.roles[actorId];
    if (!userRole || !required.includes(userRole)) {
      throw new ForbiddenDomainException(
        'Insufficient package-level role',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  // ── Entity fetch helpers ──────────────────────────────────────────────────

  private requireWbs(tenantId: string, wbsId: string): WbsRecord {
    const record = this.repository.getWbs(tenantId, wbsId);
    if (!record) {
      throw new ResourceNotFoundException(
        'WBS not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return record;
  }

  private requirePackage(tenantId: string, packageId: string): WorkPackageRecord {
    const record = this.repository.getPackage(tenantId, packageId);
    if (!record) {
      throw new ResourceNotFoundException(
        'Work package not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return record;
  }

  private requireTask(tenantId: string, taskId: string): TaskRecord {
    const record = this.repository.getTask(tenantId, taskId);
    if (!record) {
      throw new ResourceNotFoundException(
        'Task not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return record;
  }
}
