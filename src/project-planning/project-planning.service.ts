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
import { PlanningAuditService } from './project-planning-audit.service';
import { ProjectPlanningRepository } from './project-planning.repository';
import {
  AddMitigationDto,
  AddProjectMemberDto,
  CreateObjectiveDto,
  CreatePhaseDto,
  CreateProjectDto,
  CreateRiskDto,
  DecideExtensionDto,
  MutationDto,
  RecordCheckInDto,
  RequestExtensionDto,
} from './dto/project-planning.dto';
import {
  CheckInView,
  ExtensionView,
  ObjectiveView,
  PhaseView,
  PlanningActor,
  PlanningRole,
  ProjectRecord,
  ProjectView,
  RiskLikelihood,
  RiskSeverity,
  RiskView,
  ExtensionStatus,
} from './project-planning.types';

const MANAGE_ROLES: PlanningRole[] = [PlanningRole.OWNER, PlanningRole.PLANNER];
const DECIDE_ROLES: PlanningRole[] = [
  PlanningRole.OWNER,
  PlanningRole.APPROVER,
];
const PLATFORM_ADMINS = ['admin', 'moderator'];

@Injectable()
export class ProjectPlanningService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ProjectPlanningRepository,
    private readonly audit: PlanningAuditService,
  ) {}

  async createProject(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      'project.create',
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        this.assertPlatformPlanner(actor);
        const deadline = this.parseDate(dto.deadline, 'deadline');
        const now = new Date().toISOString();
        const project = this.repository.putProject({
          id: this.repository.newId(),
          tenantId,
          name: dto.name.trim(),
          deadline: new Date(deadline).toISOString(),
          members: { [actor.actorId]: PlanningRole.OWNER },
          createdAt: now,
        });
        return this.projectView(project);
      },
    );
  }

  async addProjectMember(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<{ projectId: string; userId: string; role: PlanningRole }> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `project.member.add:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const project = this.getProject(actor, tenantId, projectId, [
          PlanningRole.OWNER,
        ]);
        if (!dto.userId?.trim()) {
          throw new ValidationDomainException('userId is required');
        }
        if (!Object.values(PlanningRole).includes(dto.role)) {
          throw new ValidationDomainException('role is invalid');
        }
        project.members[dto.userId] = dto.role;
        this.repository.replaceProject(project);
        return { projectId, userId: dto.userId, role: dto.role };
      },
    );
  }

  async listProjects(
    actorInput: PlanningActor | undefined,
    tenantId: string,
  ): Promise<ProjectView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    return this.repository
      .projectsByTenant(tenantId)
      .filter(
        (project) =>
          project.members[actor.actorId] || this.isPlatformAdmin(actor),
      )
      .map((project) => this.projectView(project));
  }

  async createObjective(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreateObjectiveDto,
  ): Promise<ObjectiveView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.create:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const project = this.getProject(
          actor,
          tenantId,
          projectId,
          MANAGE_ROLES,
        );
        const objective = this.repository.putObjective({
          id: this.repository.newId(),
          tenantId,
          projectId: project.id,
          title: dto.title.trim(),
          createdAt: new Date().toISOString(),
        });
        return this.objectiveView(objective, 0);
      },
    );
  }

  async listObjectives(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<ObjectiveView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getProject(actor, tenantId, projectId);
    return this.repository
      .objectivesForProject(tenantId, projectId)
      .map((objective) =>
        this.objectiveView(
          objective,
          this.currentPercentage(tenantId, objective.id),
        ),
      );
  }

  async recordCheckIn(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    objectiveId: string,
    dto: RecordCheckInDto,
  ): Promise<CheckInView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `objective.checkin:${objectiveId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        if (
          !Number.isInteger(dto.percentage) ||
          dto.percentage < 0 ||
          dto.percentage > 100
        ) {
          throw new ValidationDomainException(
            'percentage must be an integer between 0 and 100',
          );
        }
        const objective = this.getObjective(
          actor,
          tenantId,
          objectiveId,
          MANAGE_ROLES,
        );
        const existing = this.repository.checkInsForObjective(
          tenantId,
          objectiveId,
        );
        const previous = existing.at(-1);
        const regression = Boolean(
          previous && dto.percentage < previous.percentage,
        );
        if (regression && !dto.regressionReason?.trim()) {
          throw new BusinessRuleException(
            'A regression requires an explicit regressionReason',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }
        const checkIn = this.repository.putCheckIn({
          id: this.repository.newId(),
          tenantId,
          objectiveId: objective.id,
          sequence: existing.length + 1,
          percentage: dto.percentage,
          note: dto.note,
          regressionReason: dto.regressionReason,
          recordedBy: actor.actorId,
          recordedAt: new Date().toISOString(),
        });
        return this.checkInView(checkIn, regression);
      },
    );
  }

  async listCheckIns(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    objectiveId: string,
  ): Promise<CheckInView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getObjective(actor, tenantId, objectiveId);
    return this.repository
      .checkInsForObjective(tenantId, objectiveId)
      .map((checkIn, index, all) =>
        this.checkInView(
          checkIn,
          index > 0 && checkIn.percentage < all[index - 1].percentage,
        ),
      );
  }

  async createRisk(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreateRiskDto,
  ): Promise<RiskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `risk.create:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const project = this.getProject(
          actor,
          tenantId,
          projectId,
          MANAGE_ROLES,
        );
        if (!Object.values(RiskSeverity).includes(dto.severity)) {
          throw new ValidationDomainException('severity is required');
        }
        if (!Object.values(RiskLikelihood).includes(dto.likelihood)) {
          throw new ValidationDomainException('likelihood is required');
        }
        const risk = this.repository.putRisk({
          id: this.repository.newId(),
          tenantId,
          projectId: project.id,
          title: dto.title.trim(),
          severity: dto.severity,
          likelihood: dto.likelihood,
          raisedBy: actor.actorId,
          raisedAt: new Date().toISOString(),
        });
        return this.riskView(risk);
      },
    );
  }

  async addMitigation(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    riskId: string,
    dto: AddMitigationDto,
  ): Promise<RiskView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `risk.mitigation.add:${riskId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const risk = this.getRisk(actor, tenantId, riskId, MANAGE_ROLES);
        if (risk.mitigation) {
          throw new ResourceConflictException('Mitigation already exists');
        }
        if (!dto.ownerId?.trim() || !dto.plan?.trim()) {
          throw new ValidationDomainException(
            'A mitigation requires an owner and a plan',
          );
        }
        risk.mitigation = {
          ownerId: dto.ownerId,
          plan: dto.plan,
          addedBy: actor.actorId,
          addedAt: new Date().toISOString(),
        };
        this.repository.putRisk(risk);
        return this.riskView(risk);
      },
    );
  }

  async listRisks(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<RiskView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getProject(actor, tenantId, projectId);
    return this.repository
      .risksForProject(tenantId, projectId)
      .map((risk) => this.riskView(risk));
  }

  async addPhase(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
    dto: CreatePhaseDto,
  ): Promise<PhaseView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `roadmap.phase.add:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const project = this.getProject(
          actor,
          tenantId,
          projectId,
          MANAGE_ROLES,
        );
        const start = this.parseDate(dto.startDate, 'startDate');
        const end = this.parseDate(dto.endDate, 'endDate');
        if (end <= start) {
          throw new BusinessRuleException(
            'A phase must end after it starts',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }
        const existing = this.repository.phasesForProject(tenantId, projectId);
        const latestEnd = existing.reduce(
          (max, phase) => Math.max(max, Date.parse(phase.endDate)),
          Number.NEGATIVE_INFINITY,
        );
        if (start < latestEnd) {
          throw new BusinessRuleException(
            'Phases must be date-ordered without overlap',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }
        const phase = this.repository.putPhase({
          id: this.repository.newId(),
          tenantId,
          projectId: project.id,
          name: dto.name.trim(),
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
          createdAt: new Date().toISOString(),
        });
        return this.phaseView(phase);
      },
    );
  }

  async listRoadmap(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<PhaseView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getProject(actor, tenantId, projectId);
    return this.repository
      .phasesForProject(tenantId, projectId)
      .map((phase) => this.phaseView(phase));
  }

  async requestExtension(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
    dto: RequestExtensionDto,
  ): Promise<ExtensionView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `extension.request:${projectId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const project = this.getProject(
          actor,
          tenantId,
          projectId,
          MANAGE_ROLES,
        );
        if (!dto.reason?.trim()) {
          throw new ValidationDomainException('A reason is required');
        }
        if (
          !Number.isInteger(dto.requestedDays) ||
          dto.requestedDays < 1 ||
          dto.requestedDays > 90
        ) {
          throw new ValidationDomainException(
            'requestedDays must be between 1 and 90',
          );
        }
        const request = this.repository.putExtension({
          id: this.repository.newId(),
          tenantId,
          projectId: project.id,
          requesterId: actor.actorId,
          baseDeadline: project.deadline,
          requestedDays: dto.requestedDays,
          reason: dto.reason,
          status: ExtensionStatus.PENDING,
          requestedAt: new Date().toISOString(),
        });
        return this.extensionView(request);
      },
    );
  }

  async decideExtension(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    requestId: string,
    dto: DecideExtensionDto,
  ): Promise<ExtensionView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `extension.decide:${requestId}`,
      dto,
      () => {
        const actor = this.assertActor(actorInput, tenantId);
        const request = this.getExtension(
          actor,
          tenantId,
          requestId,
          DECIDE_ROLES,
        );
        if (request.requesterId === actor.actorId) {
          throw new ForbiddenDomainException(
            'Requesters cannot decide their own extension',
            ErrorCode.BIZ_SEPARATION_OF_DUTIES,
          );
        }
        if (request.status !== ExtensionStatus.PENDING) {
          throw new ResourceConflictException(
            'Extension request is already decided',
          );
        }
        if (!Object.values(ExtensionStatus).includes(dto.decision)) {
          throw new ValidationDomainException('decision is invalid');
        }
        const decidedAt = new Date().toISOString();
        let effectiveDeadline: string | undefined;
        if (dto.decision === ExtensionStatus.APPROVED) {
          const project = this.getProject(
            actor,
            tenantId,
            request.projectId,
            DECIDE_ROLES,
          );
          effectiveDeadline = new Date(
            Date.parse(request.baseDeadline) + request.requestedDays * 86400000,
          ).toISOString();
          project.deadline = effectiveDeadline;
          this.repository.replaceProject(project);
        }
        request.status = dto.decision;
        request.decidedBy = actor.actorId;
        request.decidedAt = decidedAt;
        request.decisionNote = dto.note;
        this.repository.replaceExtension(request);
        return { ...this.extensionView(request), effectiveDeadline };
      },
    );
  }

  async listExtensionRequests(
    actorInput: PlanningActor | undefined,
    tenantId: string,
    projectId: string,
  ): Promise<ExtensionView[]> {
    await Promise.resolve();
    const actor = this.assertActor(actorInput, tenantId);
    this.getProject(actor, tenantId, projectId);
    return this.repository
      .extensionsForProject(tenantId, projectId)
      .map((request) => this.extensionView(request));
  }

  private async runIdempotent<T>(
    actorInput: PlanningActor | undefined,
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

  private assertActor(
    actor: PlanningActor | undefined,
    tenantId: string,
  ): PlanningActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim()
    ) {
      throw new ForbiddenDomainException(
        'Planning access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (actor.tenantId !== tenantId) {
      throw new ForbiddenDomainException(
        'Planning access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return actor;
  }

  private isPlatformAdmin(actor: PlanningActor): boolean {
    return actor.roles.some((role) => PLATFORM_ADMINS.includes(role));
  }

  private assertPlatformPlanner(actor: PlanningActor): void {
    const allowed = actor.roles.some((role) =>
      ['admin', 'moderator', 'tutor'].includes(role),
    );
    if (!allowed) {
      throw new ForbiddenDomainException(
        'Only platform planners can create projects',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  private getProject(
    actor: PlanningActor,
    tenantId: string,
    projectId: string,
    allowed?: PlanningRole[],
  ): ProjectRecord {
    const project = this.repository.getProject(tenantId, projectId);
    if (!project) {
      throw new ResourceNotFoundException('Project not found');
    }
    this.assertProjectAccess(project, actor, allowed);
    return project;
  }

  private assertProjectAccess(
    project: ProjectRecord,
    actor: PlanningActor,
    allowed?: PlanningRole[],
  ): void {
    const role = project.members[actor.actorId];
    if (role && (!allowed || allowed.includes(role))) {
      return;
    }
    if (this.isPlatformAdmin(actor)) {
      return;
    }
    throw new ForbiddenDomainException(
      'Planning access denied',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  private getObjective(
    actor: PlanningActor,
    tenantId: string,
    objectiveId: string,
    allowed?: PlanningRole[],
  ) {
    const objective = this.repository.getObjective(tenantId, objectiveId);
    if (!objective) {
      throw new ResourceNotFoundException('Objective not found');
    }
    this.getProject(actor, tenantId, objective.projectId, allowed);
    return objective;
  }

  private getRisk(
    actor: PlanningActor,
    tenantId: string,
    riskId: string,
    allowed?: PlanningRole[],
  ) {
    const risk = this.repository.getRisk(tenantId, riskId);
    if (!risk) {
      throw new ResourceNotFoundException('Risk not found');
    }
    this.getProject(actor, tenantId, risk.projectId, allowed);
    return risk;
  }

  private getExtension(
    actor: PlanningActor,
    tenantId: string,
    requestId: string,
    allowed?: PlanningRole[],
  ) {
    const request = this.repository.getExtension(tenantId, requestId);
    if (!request) {
      throw new ResourceNotFoundException('Extension request not found');
    }
    this.getProject(actor, tenantId, request.projectId, allowed);
    return request;
  }

  private parseDate(value: string, field: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      throw new ValidationDomainException(`${field} must be a valid date`);
    }
    return parsed;
  }

  private currentPercentage(tenantId: string, objectiveId: string): number {
    const checkIns = this.repository.checkInsForObjective(
      tenantId,
      objectiveId,
    );
    return checkIns.at(-1)?.percentage ?? 0;
  }

  private projectView(project: ProjectRecord): ProjectView {
    return {
      id: project.id,
      name: project.name,
      deadline: project.deadline,
      createdAt: project.createdAt,
    };
  }

  private objectiveView(
    objective: {
      id: string;
      projectId: string;
      title: string;
      createdAt: string;
    },
    currentPercentage: number,
  ): ObjectiveView {
    return {
      id: objective.id,
      projectId: objective.projectId,
      title: objective.title,
      currentPercentage,
      createdAt: objective.createdAt,
    };
  }

  private checkInView(
    checkIn: {
      id: string;
      objectiveId: string;
      percentage: number;
      note?: string;
      regressionReason?: string;
      recordedBy: string;
      recordedAt: string;
    },
    regression: boolean,
  ): CheckInView {
    return {
      id: checkIn.id,
      objectiveId: checkIn.objectiveId,
      percentage: checkIn.percentage,
      regression,
      hasNote: Boolean(checkIn.note?.trim()),
      hasRegressionReason: Boolean(checkIn.regressionReason?.trim()),
      recordedBy: checkIn.recordedBy,
      recordedAt: checkIn.recordedAt,
    };
  }

  private riskView(risk: {
    id: string;
    projectId: string;
    title: string;
    severity: RiskSeverity;
    likelihood: RiskLikelihood;
    mitigation?: { ownerId: string };
    raisedBy: string;
    raisedAt: string;
  }): RiskView {
    return {
      id: risk.id,
      projectId: risk.projectId,
      title: risk.title,
      severity: risk.severity,
      likelihood: risk.likelihood,
      hasMitigation: Boolean(risk.mitigation),
      ...(risk.mitigation && { mitigationOwnerId: risk.mitigation.ownerId }),
      raisedBy: risk.raisedBy,
      raisedAt: risk.raisedAt,
    };
  }

  private phaseView(phase: {
    id: string;
    projectId: string;
    name: string;
    startDate: string;
    endDate: string;
  }): PhaseView {
    return {
      id: phase.id,
      projectId: phase.projectId,
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
    };
  }

  private extensionView(request: {
    id: string;
    projectId: string;
    requesterId: string;
    baseDeadline: string;
    requestedDays: number;
    status: ExtensionStatus;
    decidedBy?: string;
    decidedAt?: string;
    decisionNote?: string;
    requestedAt: string;
  }): ExtensionView {
    return {
      id: request.id,
      projectId: request.projectId,
      requesterId: request.requesterId,
      requestedDays: request.requestedDays,
      baseDeadline: request.baseDeadline,
      hasReason: true,
      hasDecisionNote: Boolean(request.decisionNote?.trim()),
      status: request.status,
      ...(request.decidedBy && { decidedBy: request.decidedBy }),
      ...(request.decidedAt && { decidedAt: request.decidedAt }),
      requestedAt: request.requestedAt,
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function resourceIdOf(response: unknown): string {
  if (response && typeof response === 'object' && 'id' in response) {
    return typeof response.id === 'string' ? response.id : '';
  }
  return '';
}
