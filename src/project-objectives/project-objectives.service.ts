import { Injectable } from '@nestjs/common';
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
  CreateObjectiveDto,
  MutationDto,
  RecordProgressDto,
  TransitionObjectiveDto,
  UpdateObjectiveDto,
} from './dto/project-objectives.dto';
import { ObjectivesAuditService } from './project-objectives-audit.service';
import { ProjectObjectivesRepository } from './project-objectives.repository';
import {
  ALLOWED_OBJECTIVE_TRANSITIONS,
  CriterionView,
  OBJECTIVE_MANAGE_ROLES,
  OBJECTIVES_ADMIN_ROLES,
  ObjectiveDirection,
  ObjectiveProjectRole,
  ObjectiveProjectStub,
  ObjectiveRecord,
  ObjectiveStatus,
  ObjectiveView,
  ObjectiveVisibility,
  ObjectivesActor,
  PRIORITY_ORDER,
  SuccessCriterion,
} from './project-objectives.types';

type Definition = Pick<
  CreateObjectiveDto,
  | 'title'
  | 'ownerId'
  | 'unit'
  | 'direction'
  | 'baseline'
  | 'target'
  | 'startDate'
  | 'targetDate'
  | 'criteria'
>;

@Injectable()
export class ProjectObjectivesService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  /** Serialises state-changing work per tenant so check-then-write sequences are atomic. */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ProjectObjectivesRepository,
    private readonly audit: ObjectivesAuditService,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  registerProject(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    stub: ObjectiveProjectStub,
  ): void {
    const actor = this.assertActor(actorInput, tenantId);
    if (!stub.id?.trim()) {
      throw new ValidationDomainException('projectId is required');
    }
    for (const [userId, role] of Object.entries(stub.members ?? {})) {
      if (
        !userId.trim() ||
        !Object.values(ObjectiveProjectRole).includes(role)
      ) {
        throw new ValidationDomainException(
          'members must be a map of user IDs to valid project roles',
        );
      }
    }
    const existing = this.repository.getProject(tenantId, stub.id);
    if (existing) {
      this.assertCanManage(existing, actor);
    } else if (!this.isPlatformAdmin(actor)) {
      throw this.denied();
    }
    this.repository.upsertProject(stub);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createObjective(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreateObjectiveDto,
  ): Promise<ObjectiveView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.create:${projectId}`,
      dto,
      (actor) => {
        const project = this.requireProject(tenantId, projectId);
        this.assertCanManage(project, actor);
        const criteria = this.validateDefinition(project, dto);
        const now = new Date().toISOString();
        const record: ObjectiveRecord = {
          id: this.repository.newId(),
          tenantId,
          projectId,
          version: 1,
          title: dto.title.trim(),
          priority: dto.priority,
          ownerId: dto.ownerId.trim(),
          unit: dto.unit.trim(),
          direction: dto.direction,
          baseline: dto.baseline,
          target: dto.target,
          currentValue: dto.baseline,
          startDate: new Date(dto.startDate).toISOString(),
          targetDate: new Date(dto.targetDate).toISOString(),
          visibility: dto.visibility,
          charterReference: dto.charterReference ?? null,
          criteria,
          status: ObjectiveStatus.DRAFT,
          createdBy: actor.actorId,
          createdAt: now,
          updatedAt: now,
          closedAt: null,
        };
        this.repository.putObjective(record);
        return this.view(record, project, actor);
      },
    );
  }

  async updateObjective(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    objectiveId: string,
    dto: UpdateObjectiveDto,
  ): Promise<ObjectiveView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.update:${objectiveId}`,
      dto,
      (actor) => {
        const { record, project } = this.requireManaged(
          tenantId,
          objectiveId,
          actor,
        );
        this.assertVersion(record, dto.expectedVersion);
        if (record.status !== ObjectiveStatus.DRAFT) {
          throw new BusinessRuleException(
            'Only draft objectives can be edited',
            ErrorCode.BIZ_OBJECTIVE_NOT_EDITABLE,
            { status: record.status },
          );
        }
        const criteria = this.validateDefinition(project, dto);
        const next: ObjectiveRecord = {
          ...record,
          version: record.version + 1,
          title: dto.title.trim(),
          priority: dto.priority,
          ownerId: dto.ownerId.trim(),
          unit: dto.unit.trim(),
          direction: dto.direction,
          baseline: dto.baseline,
          target: dto.target,
          currentValue: dto.baseline,
          startDate: new Date(dto.startDate).toISOString(),
          targetDate: new Date(dto.targetDate).toISOString(),
          visibility: dto.visibility,
          charterReference: dto.charterReference ?? null,
          criteria,
          updatedAt: new Date().toISOString(),
        };
        this.repository.putObjective(next);
        return this.view(next, project, actor);
      },
    );
  }

  async transitionObjective(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    objectiveId: string,
    dto: TransitionObjectiveDto,
  ): Promise<ObjectiveView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.transition:${objectiveId}`,
      dto,
      (actor) => {
        const { record, project } = this.requireManaged(
          tenantId,
          objectiveId,
          actor,
        );
        this.assertVersion(record, dto.expectedVersion);
        if (
          !ALLOWED_OBJECTIVE_TRANSITIONS[record.status].includes(dto.status)
        ) {
          throw new BusinessRuleException(
            `Cannot move an objective from ${record.status} to ${dto.status}`,
            ErrorCode.BIZ_OBJECTIVE_INVALID_TRANSITION,
            {
              from: record.status,
              allowed: ALLOWED_OBJECTIVE_TRANSITIONS[record.status],
            },
          );
        }
        if (dto.status === ObjectiveStatus.ACTIVE) {
          if (!record.charterReference) {
            throw new BusinessRuleException(
              'Link the project charter before activating the objective',
              ErrorCode.BIZ_OBJECTIVE_CHARTER_REQUIRED,
            );
          }
          if (record.criteria.length === 0) {
            throw new BusinessRuleException(
              'Define at least one success criterion before activating the objective',
              ErrorCode.BIZ_OBJECTIVE_CRITERIA_REQUIRED,
            );
          }
        }
        if (dto.status === ObjectiveStatus.ACHIEVED) {
          const unmet = record.criteria.filter(
            (c) => c.required && !this.isMet(record, c),
          );
          if (unmet.length > 0) {
            throw new BusinessRuleException(
              'Required success criteria are not met yet',
              ErrorCode.BIZ_OBJECTIVE_CRITERIA_UNMET,
              { unmetCount: unmet.length },
            );
          }
        }
        const now = new Date().toISOString();
        const closing =
          dto.status === ObjectiveStatus.ACHIEVED ||
          dto.status === ObjectiveStatus.ABANDONED;
        const next: ObjectiveRecord = {
          ...record,
          version: record.version + 1,
          status: dto.status,
          updatedAt: now,
          closedAt: closing ? now : null,
        };
        this.repository.putObjective(next);
        return this.view(next, project, actor);
      },
    );
  }

  async recordProgress(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    objectiveId: string,
    dto: RecordProgressDto,
  ): Promise<ObjectiveView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.progress:${objectiveId}`,
      dto,
      (actor) => {
        const record = this.requireObjective(tenantId, objectiveId);
        const project = this.requireProject(tenantId, record.projectId);
        // The objective owner may report progress even without a manage role.
        if (record.ownerId !== actor.actorId) {
          this.assertCanManage(project, actor);
        }
        if (record.status !== ObjectiveStatus.ACTIVE) {
          throw new BusinessRuleException(
            'Progress can only be recorded on active objectives',
            ErrorCode.BIZ_OBJECTIVE_NOT_EDITABLE,
            { status: record.status },
          );
        }
        const next: ObjectiveRecord = {
          ...record,
          version: record.version + 1,
          currentValue: dto.value,
          updatedAt: new Date().toISOString(),
        };
        this.repository.putObjective(next);
        return this.view(next, project, actor);
      },
    );
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  getObjective(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    objectiveId: string,
  ): ObjectiveView {
    const actor = this.assertActor(actorInput, tenantId);
    const record = this.requireObjective(tenantId, objectiveId);
    const project = this.requireProject(tenantId, record.projectId);
    if (!this.canSee(project, record, actor)) {
      throw this.notFound();
    }
    return this.view(record, project, actor);
  }

  listObjectives(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    projectId: string,
  ): ObjectiveView[] {
    const actor = this.assertActor(actorInput, tenantId);
    const project = this.requireProject(tenantId, projectId);
    return this.repository
      .objectivesForProject(tenantId, projectId)
      .filter((o) => this.canSee(project, o, actor))
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .map((o) => this.view(o, project, actor));
  }

  getAudit(actorInput: ObjectivesActor | undefined, tenantId: string) {
    const actor = this.assertActor(actorInput, tenantId);
    if (!this.isPlatformAdmin(actor)) throw this.denied();
    return this.audit.snapshot(tenantId);
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  /** Returns the criteria with ids assigned. Throws on any inconsistency. */
  private validateDefinition(
    project: ObjectiveProjectStub,
    dto: Definition,
  ): SuccessCriterion[] {
    if (!dto.title?.trim()) {
      throw new ValidationDomainException('title must not be blank');
    }
    if (!dto.unit?.trim()) {
      throw new ValidationDomainException('unit must not be blank');
    }
    if (!project.members[dto.ownerId?.trim()]) {
      throw new BusinessRuleException(
        'The objective owner must be a project member',
        ErrorCode.BIZ_OBJECTIVE_OWNER_NOT_MEMBER,
      );
    }
    const start = Date.parse(dto.startDate);
    const end = Date.parse(dto.targetDate);
    if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
      throw new ValidationDomainException(
        'startDate must be before targetDate',
        ErrorCode.VAL_OBJECTIVE_DATES_INVALID,
      );
    }
    const increasing = dto.direction === ObjectiveDirection.INCREASE;
    if (increasing ? dto.target <= dto.baseline : dto.target >= dto.baseline) {
      throw new ValidationDomainException(
        increasing
          ? 'target must be greater than baseline when the direction is increase'
          : 'target must be less than baseline when the direction is decrease',
        ErrorCode.VAL_OBJECTIVE_TARGET_INVALID,
      );
    }
    const low = Math.min(dto.baseline, dto.target);
    const high = Math.max(dto.baseline, dto.target);
    return (dto.criteria ?? []).map((c) => {
      if (!c.label?.trim()) {
        throw new ValidationDomainException(
          'criterion label must not be blank',
        );
      }
      if (c.threshold < low || c.threshold > high) {
        throw new ValidationDomainException(
          'criterion threshold must lie between baseline and target',
          ErrorCode.VAL_OBJECTIVE_TARGET_INVALID,
        );
      }
      return {
        id: this.repository.newId(),
        label: c.label.trim(),
        threshold: c.threshold,
        required: c.required ?? true,
      };
    });
  }

  private isMet(record: ObjectiveRecord, criterion: SuccessCriterion): boolean {
    return record.direction === ObjectiveDirection.INCREASE
      ? record.currentValue >= criterion.threshold
      : record.currentValue <= criterion.threshold;
  }

  private progressPercent(record: ObjectiveRecord): number {
    const pct =
      ((record.currentValue - record.baseline) /
        (record.target - record.baseline)) *
      100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  private assertVersion(record: ObjectiveRecord, expected: number): void {
    if (record.version !== expected) {
      throw new ResourceConflictException(
        'The objective changed since you loaded it; reload and retry',
        ErrorCode.BIZ_OBJECTIVE_STALE_VERSION,
        { currentVersion: record.version },
      );
    }
  }

  // ── Authorization and visibility ──────────────────────────────────────────

  private canSee(
    project: ObjectiveProjectStub,
    record: ObjectiveRecord,
    actor: ObjectivesActor,
  ): boolean {
    if (this.isPlatformAdmin(actor)) return true;
    const role = project.members[actor.actorId];
    if (!role) return record.visibility === ObjectiveVisibility.PUBLIC;
    if (record.visibility === ObjectiveVisibility.PRIVATE) {
      return (
        OBJECTIVE_MANAGE_ROLES.includes(role) ||
        record.ownerId === actor.actorId
      );
    }
    return true;
  }

  private canSeeDetail(
    project: ObjectiveProjectStub,
    actor: ObjectivesActor,
  ): boolean {
    return (
      this.isPlatformAdmin(actor) || Boolean(project.members[actor.actorId])
    );
  }

  private assertCanManage(
    project: ObjectiveProjectStub,
    actor: ObjectivesActor,
  ): void {
    const role = project.members[actor.actorId];
    if (role && OBJECTIVE_MANAGE_ROLES.includes(role)) return;
    if (this.isPlatformAdmin(actor)) return;
    throw this.denied();
  }

  private requireManaged(
    tenantId: string,
    objectiveId: string,
    actor: ObjectivesActor,
  ) {
    const record = this.requireObjective(tenantId, objectiveId);
    const project = this.requireProject(tenantId, record.projectId);
    this.assertCanManage(project, actor);
    return { record, project };
  }

  private requireProject(
    tenantId: string,
    projectId: string,
  ): ObjectiveProjectStub {
    const project = this.repository.getProject(tenantId, projectId);
    if (!project) {
      throw new ResourceNotFoundException(
        'Project not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return project;
  }

  private requireObjective(
    tenantId: string,
    objectiveId: string,
  ): ObjectiveRecord {
    const record = this.repository.getObjective(tenantId, objectiveId);
    if (!record) throw this.notFound();
    return record;
  }

  private notFound(): ResourceNotFoundException {
    return new ResourceNotFoundException(
      'Objective not found',
      ErrorCode.RES_OBJECTIVE_NOT_FOUND,
    );
  }

  private assertActor(
    actor: ObjectivesActor | undefined,
    tenantId: string,
  ): ObjectivesActor {
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

  private isPlatformAdmin(actor: ObjectivesActor): boolean {
    return actor.roles.some((r) =>
      (OBJECTIVES_ADMIN_ROLES as readonly string[]).includes(r),
    );
  }

  private denied(): ForbiddenDomainException {
    return new ForbiddenDomainException(
      'Objectives access denied',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  /** Project members and admins get the full detail; public non-members get the minimal view. */
  private view(
    record: ObjectiveRecord,
    project: ObjectiveProjectStub,
    actor: ObjectivesActor,
  ): ObjectiveView {
    const base: ObjectiveView = {
      id: record.id,
      projectId: record.projectId,
      version: record.version,
      title: record.title,
      priority: record.priority,
      status: record.status,
      visibility: record.visibility,
      targetDate: record.targetDate,
      progressPercent: this.progressPercent(record),
      detailed: false,
    };
    if (!this.canSeeDetail(project, actor)) return base;
    const criteria: CriterionView[] = record.criteria.map((c) => ({
      ...c,
      met: this.isMet(record, c),
    }));
    return {
      ...base,
      detailed: true,
      ownerId: record.ownerId,
      unit: record.unit,
      direction: record.direction,
      baseline: record.baseline,
      target: record.target,
      currentValue: record.currentValue,
      startDate: record.startDate,
      charterReference: record.charterReference,
      criteria,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  // ── Idempotency and serialisation ─────────────────────────────────────────

  private async runIdempotent<T>(
    actorInput: ObjectivesActor | undefined,
    tenantId: string,
    operation: string,
    payload: MutationDto,
    work: (actor: ObjectivesActor) => T | Promise<T>,
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
