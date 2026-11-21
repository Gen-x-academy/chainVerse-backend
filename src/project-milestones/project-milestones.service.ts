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
import { MilestonesAuditService } from './project-milestones-audit.service';
import { ProjectMilestonesRepository } from './project-milestones.repository';
import {
  AssignReviewerDto,
  CreateMilestoneDto,
  MutationDto,
  TransitionMilestoneDto,
  UpdateMilestoneDto,
} from './dto/project-milestones.dto';
import {
  ALLOWED_MILESTONE_TRANSITIONS,
  MilestoneAuditEntry,
  MilestoneProjectRole,
  MilestoneProjectStub,
  MilestoneRecord,
  MilestoneStatus,
  MilestoneView,
  MilestonesActor,
  PLATFORM_MILESTONE_ROLES,
  TERMINAL_MILESTONE_STATUSES,
} from './project-milestones.types';

const MANAGE_ROLES: MilestoneProjectRole[] = [
  MilestoneProjectRole.OWNER,
  MilestoneProjectRole.PLANNER,
];
const REVIEW_ROLES: MilestoneProjectRole[] = [
  MilestoneProjectRole.OWNER,
  MilestoneProjectRole.REVIEWER,
];
const READ_ROLES: MilestoneProjectRole[] = Object.values(MilestoneProjectRole);

@Injectable()
export class ProjectMilestonesService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ProjectMilestonesRepository,
    private readonly audit: MilestonesAuditService,
  ) {}

  // ── Project stubs ─────────────────────────────────────────────────────────

  /**
   * Register or update a project stub so the milestones service can resolve
   * membership without coupling to the project-planning module. Called by the
   * controller after the JWT/roles guards have already validated the request.
   */
  registerProject(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    stub: MilestoneProjectStub,
  ): void {
    const actor = this.assertActor(actorInput, tenantId);
    if (!stub.id?.trim()) {
      throw new ValidationDomainException('projectId is required');
    }
    const existing = this.repository.getProject(tenantId, stub.id);
    if (existing) {
      this.assertProjectAccess(existing, actor, MANAGE_ROLES);
    } else if (!this.isPlatformAdmin(actor)) {
      throw new ForbiddenDomainException(
        'Milestones access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    const memberEntries = Object.entries(stub.members ?? {});
    for (const [userId, role] of memberEntries) {
      if (
        !userId.trim() ||
        !Object.values(MilestoneProjectRole).includes(role)
      ) {
        throw new ValidationDomainException(
          'members must be a map of user IDs to valid project roles',
        );
      }
    }
    this.repository.upsertProject(stub);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createMilestone(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreateMilestoneDto,
  ): Promise<MilestoneView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `milestone.create:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        this.getProject(actor, tenantId, projectId, MANAGE_ROLES);

        if (!dto.title?.trim()) {
          throw new ValidationDomainException('title must not be blank');
        }
        const dueDate = this.parseDate(dto.dueDate, 'dueDate');
        const now = new Date().toISOString();

        const dependsOn = dto.dependsOn ?? [];
        this.assertNoCycle(tenantId, projectId, dependsOn, null);

        const sequence =
          this.repository.maxSequenceForProject(tenantId, projectId) + 1;

        const record = this.repository.putMilestone({
          id: this.repository.newId(),
          tenantId,
          projectId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          sequence,
          dueDate: new Date(dueDate).toISOString(),
          status: MilestoneStatus.DRAFT,
          dependsOn,
          reviewerId: dto.reviewerId?.trim() ?? null,
          deliverables: dto.deliverables ?? [],
          fundingReferenceId: dto.fundingReferenceId?.trim() ?? null,
          completionCriteria: dto.completionCriteria?.trim() ?? null,
          createdBy: actor.actorId,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          completedBy: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
        });

        return this.milestoneView(record);
      },
    );
  }

  async updateMilestone(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    milestoneId: string,
    dto: UpdateMilestoneDto,
  ): Promise<MilestoneView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `milestone.update:${milestoneId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.getMilestone(actor, tenantId, milestoneId, MANAGE_ROLES);

        if (TERMINAL_MILESTONE_STATUSES.includes(record.status)) {
          throw new BusinessRuleException(
            'Milestone is in a terminal state and cannot be updated',
            ErrorCode.BIZ_MILESTONE_INVALID_TRANSITION,
          );
        }
        if (record.status !== MilestoneStatus.DRAFT) {
          throw new BusinessRuleException(
            'Only DRAFT milestones can be updated; transition to DRAFT first if needed',
            ErrorCode.BIZ_MILESTONE_INVALID_TRANSITION,
          );
        }

        if (dto.dependsOn !== undefined) {
          this.assertNoCycle(
            tenantId,
            record.projectId,
            dto.dependsOn,
            milestoneId,
          );
        }
        if (dto.dueDate !== undefined) {
          this.parseDate(dto.dueDate, 'dueDate');
        }
        if (dto.title !== undefined && !dto.title.trim()) {
          throw new ValidationDomainException('title must not be blank');
        }

        const updated: MilestoneRecord = {
          ...record,
          title: dto.title !== undefined ? dto.title.trim() : record.title,
          description:
            dto.description !== undefined
              ? dto.description.trim()
              : record.description,
          dueDate:
            dto.dueDate !== undefined
              ? new Date(this.parseDate(dto.dueDate, 'dueDate')).toISOString()
              : record.dueDate,
          dependsOn: dto.dependsOn ?? record.dependsOn,
          reviewerId:
            dto.reviewerId !== undefined
              ? (dto.reviewerId.trim() || null)
              : record.reviewerId,
          deliverables: dto.deliverables ?? record.deliverables,
          fundingReferenceId:
            dto.fundingReferenceId !== undefined
              ? (dto.fundingReferenceId.trim() || null)
              : record.fundingReferenceId,
          completionCriteria:
            dto.completionCriteria !== undefined
              ? (dto.completionCriteria.trim() || null)
              : record.completionCriteria,
          updatedAt: new Date().toISOString(),
        };

        this.repository.replaceMilestone(updated);
        return this.milestoneView(updated);
      },
    );
  }

  async transitionMilestone(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    milestoneId: string,
    dto: TransitionMilestoneDto,
  ): Promise<MilestoneView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `milestone.transition:${milestoneId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);

        // COMPLETED transitions require the reviewer role.
        const allowedRoles =
          dto.status === MilestoneStatus.COMPLETED ? REVIEW_ROLES : MANAGE_ROLES;
        const record = this.getMilestone(
          actor,
          tenantId,
          milestoneId,
          allowedRoles,
        );
        if (
          dto.status === MilestoneStatus.COMPLETED &&
          record.reviewerId &&
          actor.actorId !== record.reviewerId &&
          !this.isPlatformAdmin(actor)
        ) {
          const project = this.repository.getProject(
            tenantId,
            record.projectId,
          );
          if (
            project?.members[actor.actorId] !== MilestoneProjectRole.OWNER
          ) {
            throw new ForbiddenDomainException(
              'Only the designated reviewer or project owner may complete this milestone',
              ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
            );
          }
        }

        const allowed = ALLOWED_MILESTONE_TRANSITIONS[record.status];
        if (!allowed.includes(dto.status)) {
          throw new BusinessRuleException(
            `Cannot transition milestone from '${record.status}' to '${dto.status}'`,
            ErrorCode.BIZ_MILESTONE_INVALID_TRANSITION,
          );
        }

        if (dto.status === MilestoneStatus.ACTIVE) {
          this.assertDependenciesMet(tenantId, record);
        }

        if (
          dto.status === MilestoneStatus.CANCELLED &&
          !dto.cancellationReason?.trim()
        ) {
          throw new ValidationDomainException(
            'cancellationReason is required when cancelling a milestone',
          );
        }

        const now = new Date().toISOString();
        const updated: MilestoneRecord = {
          ...record,
          status: dto.status,
          updatedAt: now,
          completedAt:
            dto.status === MilestoneStatus.COMPLETED ? now : record.completedAt,
          completedBy:
            dto.status === MilestoneStatus.COMPLETED
              ? actor.actorId
              : record.completedBy,
          cancelledAt:
            dto.status === MilestoneStatus.CANCELLED ? now : record.cancelledAt,
          cancelledBy:
            dto.status === MilestoneStatus.CANCELLED
              ? actor.actorId
              : record.cancelledBy,
          cancellationReason:
            dto.status === MilestoneStatus.CANCELLED
              ? (dto.cancellationReason?.trim() ?? null)
              : record.cancellationReason,
        };

        this.repository.replaceMilestone(updated);
        return this.milestoneView(updated);
      },
    );
  }

  async assignReviewer(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    milestoneId: string,
    dto: AssignReviewerDto,
  ): Promise<MilestoneView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `milestone.reviewer.assign:${milestoneId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const record = this.getMilestone(
          actor,
          tenantId,
          milestoneId,
          MANAGE_ROLES,
        );

        if (TERMINAL_MILESTONE_STATUSES.includes(record.status)) {
          throw new BusinessRuleException(
            'Cannot assign a reviewer to a milestone in a terminal state',
            ErrorCode.BIZ_MILESTONE_ALREADY_COMPLETED,
          );
        }

        const updated: MilestoneRecord = {
          ...record,
          reviewerId: dto.reviewerId.trim(),
          updatedAt: new Date().toISOString(),
        };
        this.repository.replaceMilestone(updated);
        return this.milestoneView(updated);
      },
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async listMilestones(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<MilestoneView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getProject(actor, tenantId, projectId, READ_ROLES);
    return this.repository
      .milestonesForProject(tenantId, projectId)
      .map((m) => this.milestoneView(m));
  }

  async getMilestoneById(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    milestoneId: string,
  ): Promise<MilestoneView> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    const record = this.getMilestone(actor, tenantId, milestoneId, READ_ROLES);
    return this.milestoneView(record);
  }

  getAudit(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
  ): readonly MilestoneAuditEntry[] {
    const actor = this.assertActor(actorInput, tenantId);
    if (
      !actor.roles.some((role) =>
        ['admin', 'moderator'].includes(role.toLowerCase()),
      )
    ) {
      throw new ForbiddenDomainException(
        'Milestones access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return this.audit
      .snapshot()
      .filter((entry) => entry.tenantId === tenantId);
  }

  // ── Private: idempotency + serialization ─────────────────────────────────

  private async runIdempotent<T>(
    actorInput: MilestonesActor | undefined,
    tenantId: string,
    operation: string,
    payload: MutationDto,
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

  // ── Private: authorization ────────────────────────────────────────────────

  private assertActor(
    actor: MilestonesActor | undefined,
    tenantId: string,
  ): MilestonesActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim()
    ) {
      throw new ForbiddenDomainException(
        'Milestones access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (actor.tenantId !== tenantId) {
      throw new ForbiddenDomainException(
        'Milestones access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return actor;
  }

  private isPlatformAdmin(actor: MilestonesActor): boolean {
    return actor.roles.some((r) =>
      (PLATFORM_MILESTONE_ROLES as readonly string[]).includes(r),
    );
  }

  private getProject(
    actor: MilestonesActor,
    tenantId: string,
    projectId: string,
    allowed?: MilestoneProjectRole[],
  ): MilestoneProjectStub {
    const project = this.repository.getProject(tenantId, projectId);
    if (!project) {
      throw new ResourceNotFoundException(
        'Project not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    this.assertProjectAccess(project, actor, allowed);
    return project;
  }

  private assertProjectAccess(
    project: MilestoneProjectStub,
    actor: MilestonesActor,
    allowed?: MilestoneProjectRole[],
  ): void {
    const role = project.members[actor.actorId] as
      | MilestoneProjectRole
      | undefined;
    if (role && (!allowed || allowed.includes(role))) {
      return;
    }
    if (this.isPlatformAdmin(actor)) {
      return;
    }
    throw new ForbiddenDomainException(
      'Milestones access denied',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  private getMilestone(
    actor: MilestonesActor,
    tenantId: string,
    milestoneId: string,
    allowed?: MilestoneProjectRole[],
  ): MilestoneRecord {
    const record = this.repository.getMilestone(tenantId, milestoneId);
    if (!record) {
      throw new ResourceNotFoundException(
        'Milestone not found',
        ErrorCode.RES_MILESTONE_NOT_FOUND,
      );
    }
    // Validate project access as well.
    this.getProject(actor, tenantId, record.projectId, allowed);
    return record;
  }

  // ── Private: domain rules ─────────────────────────────────────────────────

  /**
   * Validates that activating this milestone is allowed by checking every
   * predecessor is COMPLETED.  Stale dependencies fail with a stable error.
   */
  private assertDependenciesMet(
    tenantId: string,
    record: MilestoneRecord,
  ): void {
    for (const depId of record.dependsOn) {
      const dep = this.repository.getMilestone(tenantId, depId);
      if (!dep || dep.status !== MilestoneStatus.COMPLETED) {
        throw new BusinessRuleException(
          `Dependency milestone '${depId}' must be COMPLETED before this milestone can become ACTIVE`,
          ErrorCode.BIZ_MILESTONE_DEPENDENCY_NOT_MET,
          { unmetDependencyId: depId },
        );
      }
    }
  }

  /**
   * Detects dependency cycles using DFS.  Called on create and dependency
   * update before persisting.
   *
   * @param skipId  The milestone being updated (exclude it from the graph to
   *                avoid a false positive against itself).
   */
  private assertNoCycle(
    tenantId: string,
    projectId: string,
    newDeps: string[],
    skipId: string | null,
  ): void {
    for (const depId of newDeps) {
      const dep = this.repository.getMilestone(tenantId, depId);
      if (!dep || dep.projectId !== projectId) {
        throw new ResourceNotFoundException(
          `Dependency milestone '${depId}' was not found in this project`,
          ErrorCode.RES_MILESTONE_NOT_FOUND,
        );
      }
    }
    // Build adjacency from all existing milestones + the proposed change.
    const allRecords = this.repository.milestonesForProject(tenantId, projectId);
    const adjacency = new Map<string, string[]>();
    for (const m of allRecords) {
      if (m.id === skipId) continue;
      adjacency.set(m.id, [...m.dependsOn]);
    }
    // The node being created/updated is represented by a placeholder.
    const nodeId = skipId ?? '__new__';
    adjacency.set(nodeId, newDeps);

    // DFS from nodeId; a path back to nodeId is a cycle.
    const visited = new Set<string>();
    const stack = [...newDeps];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === nodeId) {
        throw new BusinessRuleException(
          'Dependency would create a cycle',
          ErrorCode.BIZ_MILESTONE_CYCLE_DETECTED,
        );
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const children = adjacency.get(current) ?? [];
      stack.push(...children);
    }
  }

  // ── Private: parsing and mapping ─────────────────────────────────────────

  private parseDate(value: string, field: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new ValidationDomainException(
        `${field} must be a valid ISO-8601 date`,
        ErrorCode.VAL_MILESTONE_DATE_INVALID,
      );
    }
    return parsed;
  }

  private milestoneView(record: MilestoneRecord): MilestoneView {
    return {
      id: record.id,
      projectId: record.projectId,
      title: record.title,
      sequence: record.sequence,
      dueDate: record.dueDate,
      status: record.status,
      dependsOn: [...record.dependsOn],
      reviewerId: record.reviewerId,
      deliverableCount: record.deliverables.length,
      fundingReferenceId: record.fundingReferenceId,
      hasCompletionCriteria: Boolean(record.completionCriteria?.trim()),
      hasDescription: Boolean(record.description?.trim()),
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
      completedBy: record.completedBy,
      cancelledAt: record.cancelledAt,
      cancelledBy: record.cancelledBy,
      hasCancellationReason: Boolean(record.cancellationReason?.trim()),
    };
  }
}

// ── Module-private utilities ──────────────────────────────────────────────────

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceIdOf(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id);
  }
  return '';
}
