import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import {
  AuditContext,
  AuditService,
  systemAuditContext,
} from '../../common/audit';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  CloseProjectDto,
  ProjectClosureConsentDto,
} from '../dto/project-workspace.dto';
import {
  ClosureConsentDecision,
  ObjectiveStatus,
  ProjectClosureConsent,
  ProjectClosureOutcome,
  ProjectClosureReason,
  ProjectWorkspaceDocument,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivityDocument,
} from '../schemas/workspace-activity.schema';
import {
  assertWorkspaceTransition,
  normalizeIdempotencyKey,
} from '../support/workspace-rules';
import { WorkspaceAccessService } from './workspace-access.service';

const INACTIVITY_DAYS = 90;
const WORKSPACE_MEMBER_ROLES = [
  WorkspaceRole.OWNER,
  WorkspaceRole.EDITOR,
  WorkspaceRole.VIEWER,
  WorkspaceRole.SPONSOR,
];

type ClosureView = {
  id: string;
  status: WorkspaceStatus;
  version: number;
  closure: {
    reason: ProjectClosureReason;
    outcome: ProjectClosureOutcome;
    closedAt: Date;
  } | null;
  terminationProposal: {
    reason: ProjectClosureReason.MUTUAL_TERMINATION;
    initiatedAt: Date;
    consentsReceived: number;
    consentsRequired: number;
  } | null;
};

@Injectable()
export class ProjectClosureService {
  private readonly logger = new Logger(ProjectClosureService.name);

  constructor(
    @InjectModel(ProjectWorkspace.name)
    private readonly workspaces: Model<ProjectWorkspaceDocument>,
    @InjectModel(WorkspaceActivity.name)
    private readonly activity: Model<WorkspaceActivityDocument>,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async close(
    actorId: string,
    actorRole: string,
    audit: AuditContext,
    projectId: string,
    dto: CloseProjectDto,
  ): Promise<ClosureView> {
    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (!idempotencyKey) {
      throw new ValidationDomainException(
        'idempotencyKey is required',
        ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      );
    }
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) {
      throw new ValidationDomainException(
        'expectedVersion must be a positive integer',
        ErrorCode.VAL_INVALID_REVISION,
      );
    }
    if (
      ![
        ProjectClosureReason.SUCCESSFUL_COMPLETION,
        ProjectClosureReason.MUTUAL_TERMINATION,
        ProjectClosureReason.POLICY_ACTION,
        ProjectClosureReason.SPONSOR_WITHDRAWAL,
      ].includes(dto.reason)
    ) {
      throw new ValidationDomainException(
        'Closure reason is unsupported',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const requestHash = hash(
      `${actorId}|${dto.reason}|${dto.expectedVersion}|${idempotencyKey}`,
    );
    const workspace = await this.loadForReason(
      actorId,
      actorRole,
      projectId,
      dto.reason,
    );

    if (workspace.closure) {
      if (workspace.closure.idempotencyKey === dto.idempotencyKey) {
        this.assertSameRequest(workspace.closure.requestHash, requestHash);
        return this.view(workspace);
      }
      throw new ResourceConflictException(
        'Project is already closed',
        ErrorCode.BIZ_WORKSPACE_ALREADY_CLOSED,
      );
    }
    if (
      workspace.status === WorkspaceStatus.COMPLETED ||
      workspace.status === WorkspaceStatus.ARCHIVED
    ) {
      throw new ResourceConflictException(
        'Project is already in a terminal lifecycle state',
        ErrorCode.BIZ_WORKSPACE_ALREADY_CLOSED,
      );
    }

    if (
      dto.reason === ProjectClosureReason.MUTUAL_TERMINATION &&
      workspace.terminationProposal?.idempotencyKey === idempotencyKey
    ) {
      this.assertSameRequest(
        workspace.terminationProposal.requestHash,
        requestHash,
      );
      return this.view(workspace);
    }

    this.assertVersion(dto.expectedVersion, workspace.version);
    this.assertTransition(workspace.status, dto.reason);

    if (dto.reason === ProjectClosureReason.MUTUAL_TERMINATION) {
      return this.proposeMutualClosure(
        workspace,
        actorId,
        audit,
        dto,
        requestHash,
      );
    }

    if (dto.reason === ProjectClosureReason.SUCCESSFUL_COMPLETION) {
      this.assertComplete(workspace);
    }

    const now = new Date();
    const outcome = this.outcomeFor(dto.reason);
    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          tenantId: workspace.tenantId,
          version: dto.expectedVersion,
          status: workspace.status,
          closure: null,
        },
        {
          $set: {
            status: this.statusFor(dto.reason),
            closure: {
              reason: dto.reason,
              outcome,
              closedAt: now,
              closedBy: actorId,
              idempotencyKey,
              requestHash,
              consents: [],
            },
            terminationProposal: null,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      const fresh = await this.workspaces.findById(projectId).exec();
      if (fresh && fresh.closure?.idempotencyKey === dto.idempotencyKey) {
        this.assertSameRequest(fresh.closure.requestHash, requestHash);
        return this.view(fresh);
      }
      this.throwWriteConflict(dto.expectedVersion, fresh);
    }

    await this.recordClosure(
      updated,
      actorId,
      audit,
      workspace.status,
      dto.reason,
      outcome,
    );
    return this.view(updated);
  }

  async consent(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: ProjectClosureConsentDto,
  ): Promise<ClosureView> {
    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (!idempotencyKey) {
      throw new ValidationDomainException(
        'idempotencyKey is required',
        ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      );
    }
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) {
      throw new ValidationDomainException(
        'expectedVersion must be a positive integer',
        ErrorCode.VAL_INVALID_REVISION,
      );
    }
    if (dto.decision !== ClosureConsentDecision.ACCEPT) {
      throw new ValidationDomainException(
        'Only affirmative consent is recorded; do not submit consent to refuse',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const workspace = await this.access.load(
      projectId,
      actorId,
      WORKSPACE_MEMBER_ROLES,
    );
    const requestHash = hash(
      `${actorId}|${dto.decision}|${dto.expectedVersion}|${idempotencyKey}`,
    );

    if (workspace.closure) {
      const prior = workspace.closure.consents?.find(
        (consent) =>
          consent.userId === actorId &&
          consent.idempotencyKey === idempotencyKey,
      );
      if (prior) {
        this.assertSameRequest(prior.requestHash, requestHash);
        return this.view(workspace);
      }
      throw new ResourceConflictException(
        'Project is already closed',
        ErrorCode.BIZ_WORKSPACE_ALREADY_CLOSED,
      );
    }

    const proposal = workspace.terminationProposal;
    if (!proposal) {
      throw new BusinessRuleException(
        'No mutual-termination proposal is pending',
        ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
      );
    }
    const existing = proposal.consents.find(
      (consent) => consent.userId === actorId,
    );
    if (existing) {
      if (existing.idempotencyKey === idempotencyKey) {
        this.assertSameRequest(existing.requestHash, requestHash);
        return this.view(workspace);
      }
      throw new ResourceConflictException(
        'This member has already consented to the pending termination',
        ErrorCode.BIZ_WORKSPACE_CONSENT_EXISTS,
      );
    }
    this.assertVersion(dto.expectedVersion, workspace.version);

    const consent: ProjectClosureConsent = {
      userId: actorId,
      decision: dto.decision,
      idempotencyKey,
      requestHash,
      consentedAt: new Date(),
    };
    const consents = [...proposal.consents, consent];
    const required = new Set(
      workspace.members.map((member) => member.userId),
    ).size;
    const closesProject = consents.length >= required;
    const update: Record<string, unknown> = closesProject
      ? {
          $set: {
            status: WorkspaceStatus.ARCHIVED,
            terminationProposal: null,
            closure: {
              reason: ProjectClosureReason.MUTUAL_TERMINATION,
              outcome: ProjectClosureOutcome.MUTUALLY_TERMINATED,
              closedAt: consent.consentedAt,
              closedBy: actorId,
              idempotencyKey: proposal.idempotencyKey,
              requestHash: proposal.requestHash,
              consents,
            },
          },
          $inc: { version: 1 },
        }
      : {
          $push: { 'terminationProposal.consents': consent },
          $inc: { version: 1 },
        };
    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          tenantId: workspace.tenantId,
          version: dto.expectedVersion,
          status: workspace.status,
          closure: null,
          'terminationProposal.idempotencyKey': proposal.idempotencyKey,
          'terminationProposal.consents.userId': { $ne: actorId },
        },
        update,
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      const fresh = await this.workspaces.findById(projectId).exec();
      const replay = fresh?.closure?.consents?.find(
        (entry) =>
          entry.userId === actorId &&
          entry.idempotencyKey === dto.idempotencyKey,
      );
      if (fresh && replay) {
        this.assertSameRequest(replay.requestHash, requestHash);
        return this.view(fresh);
      }
      this.throwWriteConflict(dto.expectedVersion, fresh);
    }

    if (closesProject) {
      await this.recordClosure(
        updated,
        actorId,
        audit,
        workspace.status,
        ProjectClosureReason.MUTUAL_TERMINATION,
        ProjectClosureOutcome.MUTUALLY_TERMINATED,
      );
    } else {
      await this.audit.record({
        action: 'project_workspace.closure_consented',
        context: privacySafeAuditContext(audit),
        target: { type: 'project_workspace', id: projectId },
        after: {
          id: projectId,
          consentsReceived: consents.length,
          consentsRequired: required,
        },
      });
      this.emitActivity(
        updated,
        actorId,
        audit.requestId,
        'project_workspace.closure_consented',
      );
    }
    return this.view(updated);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'project-workspace-inactivity-closure',
  })
  async closeInactiveProjects(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - INACTIVITY_DAYS * 86_400_000);
    let closedCount = 0;
    try {
      const candidates = await this.workspaces
        .find({
          status: { $in: [WorkspaceStatus.ACTIVE, WorkspaceStatus.ON_HOLD] },
          updatedAt: { $lt: cutoff },
          closure: null,
          terminationProposal: null,
        })
        .exec();

      for (const workspace of candidates) {
        const projectId = String(workspace._id);
        const latestActivity = await this.activity
          .findOne({ tenantId: workspace.tenantId, projectId })
          .sort({ createdAt: -1 })
          .exec();
        const lastActivityAt = latestActivity?.createdAt ?? workspace.updatedAt;
        if (lastActivityAt && lastActivityAt >= cutoff) continue;

        const idempotencyKey = `inactivity:${projectId}:${cutoff
          .toISOString()
          .slice(0, 10)}`;
        const requestHash = hash(
          `${ProjectClosureReason.INACTIVITY}|${lastActivityAt?.toISOString() ?? ''}`,
        );
        const closedAt = new Date(now);
        const updated = await this.workspaces
          .findOneAndUpdate(
            {
              _id: workspace._id,
              tenantId: workspace.tenantId,
              version: workspace.version,
              status: workspace.status,
              closure: null,
              terminationProposal: null,
              updatedAt: { $lt: cutoff },
            },
            {
              $set: {
                status: WorkspaceStatus.ARCHIVED,
                closure: {
                  reason: ProjectClosureReason.INACTIVITY,
                  outcome: ProjectClosureOutcome.TERMINATED_FOR_INACTIVITY,
                  closedAt,
                  closedBy: 'system:inactivity',
                  idempotencyKey,
                  requestHash,
                  consents: [],
                },
              },
              $inc: { version: 1 },
            },
            { new: true, runValidators: true },
          )
          .exec();
        if (!updated) continue;

        await this.recordClosure(
          updated,
          'system:inactivity',
          systemAuditContext(idempotencyKey, 'system:inactivity'),
          workspace.status,
          ProjectClosureReason.INACTIVITY,
          ProjectClosureOutcome.TERMINATED_FOR_INACTIVITY,
        );
        closedCount += 1;
      }
      this.logger.log(
        `Inactivity closure sweep candidates=${candidates.length} closed=${closedCount}`,
      );
      return closedCount;
    } catch (error) {
      this.logger.error(
        'Project inactivity closure sweep failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async proposeMutualClosure(
    workspace: ProjectWorkspaceDocument,
    actorId: string,
    audit: AuditContext,
    dto: CloseProjectDto,
    requestHash: string,
  ): Promise<ClosureView> {
    const proposal = workspace.terminationProposal;
    if (proposal) {
      if (proposal.idempotencyKey === dto.idempotencyKey) {
        this.assertSameRequest(proposal.requestHash, requestHash);
        return this.view(workspace);
      }
      throw new ResourceConflictException(
        'A mutual-termination proposal is already pending',
        ErrorCode.BIZ_WORKSPACE_CLOSURE_PENDING,
      );
    }
    const members = [...new Set(workspace.members.map((member) => member.userId))];
    if (members.length < 2) {
      throw new BusinessRuleException(
        'Mutual termination requires at least two current project members',
        ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
      );
    }

    const initiatedAt = new Date();
    const initialConsent: ProjectClosureConsent = {
      userId: actorId,
      decision: ClosureConsentDecision.ACCEPT,
      idempotencyKey: dto.idempotencyKey,
      requestHash,
      consentedAt: initiatedAt,
    };
    const terminationProposal = {
      idempotencyKey: dto.idempotencyKey,
      requestHash,
      initiatedBy: actorId,
      initiatedAt,
      consents: [initialConsent],
    };
    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: String(workspace._id),
          tenantId: workspace.tenantId,
          version: dto.expectedVersion,
          status: workspace.status,
          closure: null,
          terminationProposal: null,
        },
        {
          $set: { terminationProposal },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      const fresh = await this.workspaces.findById(workspace._id).exec();
      if (
        fresh &&
        fresh.terminationProposal?.idempotencyKey === dto.idempotencyKey
      ) {
        this.assertSameRequest(fresh.terminationProposal.requestHash, requestHash);
        return this.view(fresh);
      }
      this.throwWriteConflict(dto.expectedVersion, fresh);
    }

    await this.audit.record({
      action: 'project_workspace.closure_proposed',
      context: privacySafeAuditContext(audit),
      target: { type: 'project_workspace', id: String(workspace._id) },
      after: {
        id: String(workspace._id),
        reason: ProjectClosureReason.MUTUAL_TERMINATION,
        consentsReceived: 1,
        consentsRequired: members.length,
      },
    });
    this.emitActivity(
      updated,
      actorId,
      audit.requestId,
      'project_workspace.closure_proposed',
    );
    return this.view(updated);
  }

  private async loadForReason(
    actorId: string,
    actorRole: string,
    projectId: string,
    reason: CloseProjectDto['reason'],
  ): Promise<ProjectWorkspaceDocument> {
    if (reason === ProjectClosureReason.POLICY_ACTION) {
      if (!['admin', 'moderator'].includes(actorRole)) {
        throw new ForbiddenDomainException(
          'Policy closure requires an administrator or moderator',
          ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        );
      }
      return this.access.load(projectId, actorId, [
        WorkspaceRole.OWNER,
        WorkspaceRole.EDITOR,
      ]);
    }
    if (reason === ProjectClosureReason.SUCCESSFUL_COMPLETION) {
      return this.access.load(projectId, actorId, [WorkspaceRole.OWNER]);
    }
    if (reason === ProjectClosureReason.SPONSOR_WITHDRAWAL) {
      return this.access.load(projectId, actorId, [WorkspaceRole.SPONSOR]);
    }
    return this.access.load(projectId, actorId, WORKSPACE_MEMBER_ROLES);
  }

  private assertComplete(workspace: ProjectWorkspaceDocument): void {
    const objectivesComplete = (workspace.objectives ?? []).every(
      (objective) => objective.status === ObjectiveStatus.DONE,
    );
    const milestonesComplete = (workspace.milestones ?? []).every(
      (milestone) => milestone.complete,
    );
    if (!objectivesComplete || !milestonesComplete) {
      throw new BusinessRuleException(
        'All project objectives and milestones must be complete before closure',
        ErrorCode.BIZ_WORKSPACE_COMPLETION_INCOMPLETE,
      );
    }
  }

  private assertTransition(
    status: WorkspaceStatus,
    reason: ProjectClosureReason,
  ): void {
    if (reason === ProjectClosureReason.SUCCESSFUL_COMPLETION) {
      assertWorkspaceTransition(status, WorkspaceStatus.COMPLETED);
      return;
    }
    assertWorkspaceTransition(status, WorkspaceStatus.ARCHIVED);
  }

  private statusFor(reason: ProjectClosureReason): WorkspaceStatus {
    return reason === ProjectClosureReason.SUCCESSFUL_COMPLETION
      ? WorkspaceStatus.COMPLETED
      : WorkspaceStatus.ARCHIVED;
  }

  private outcomeFor(reason: ProjectClosureReason): ProjectClosureOutcome {
    switch (reason) {
      case ProjectClosureReason.SUCCESSFUL_COMPLETION:
        return ProjectClosureOutcome.COMPLETED;
      case ProjectClosureReason.MUTUAL_TERMINATION:
        return ProjectClosureOutcome.MUTUALLY_TERMINATED;
      case ProjectClosureReason.INACTIVITY:
        return ProjectClosureOutcome.TERMINATED_FOR_INACTIVITY;
      case ProjectClosureReason.POLICY_ACTION:
        return ProjectClosureOutcome.TERMINATED_BY_POLICY;
      case ProjectClosureReason.SPONSOR_WITHDRAWAL:
        return ProjectClosureOutcome.TERMINATED_BY_SPONSOR;
      default:
        throw new ValidationDomainException(
          'Closure reason is unsupported',
          ErrorCode.VAL_INVALID_INPUT,
        );
    }
  }

  private async recordClosure(
    workspace: ProjectWorkspaceDocument,
    actorId: string,
    audit: AuditContext,
    previousStatus: WorkspaceStatus,
    reason: ProjectClosureReason,
    outcome: ProjectClosureOutcome,
  ): Promise<void> {
    const projectId = String(workspace._id);
    await this.audit.record({
      action: 'project_workspace.closed',
      context: privacySafeAuditContext(audit),
      target: { type: 'project_workspace', id: projectId },
      before: { status: previousStatus },
      after: {
        id: projectId,
        status: workspace.status,
        reason,
        outcome,
      },
    });
    this.emitActivity(
      workspace,
      actorId,
      audit.requestId,
      'project_workspace.closed',
    );
  }

  private emitActivity(
    workspace: ProjectWorkspaceDocument,
    actorId: string,
    requestId: string,
    action: string,
  ): void {
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId: String(workspace._id),
      actorId,
      action,
      targetType: 'project_workspace',
      targetId: String(workspace._id),
      requestId,
    });
  }

  private view(workspace: ProjectWorkspaceDocument): ClosureView {
    const closure = workspace.closure;
    const proposal = workspace.terminationProposal;
    return {
      id: String(workspace._id),
      status: workspace.status,
      version: workspace.version,
      closure: closure
        ? {
            reason: closure.reason,
            outcome: closure.outcome,
            closedAt: closure.closedAt,
          }
        : null,
      terminationProposal: proposal
        ? {
            reason: ProjectClosureReason.MUTUAL_TERMINATION,
            initiatedAt: proposal.initiatedAt,
            consentsReceived: proposal.consents.length,
            consentsRequired: new Set(
              (workspace.members ?? []).map((member) => member.userId),
            ).size,
          }
        : null,
    };
  }

  private assertVersion(expected: number, actual: number): void {
    if (expected !== actual) {
      throw new BusinessRuleException(
        `Expected workspace version ${expected} but found ${actual}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected, actual },
      );
    }
  }

  private throwWriteConflict(
    expectedVersion: number,
    fresh: ProjectWorkspaceDocument | null,
  ): never {
    if (fresh && fresh.version !== expectedVersion) {
      throw new BusinessRuleException(
        `Expected workspace version ${expectedVersion} but found ${fresh.version}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected: expectedVersion, actual: fresh.version },
      );
    }
    throw new ResourceConflictException(
      'Workspace changed concurrently or is already closed; reload and retry',
      ErrorCode.BIZ_WORKSPACE_ALREADY_CLOSED,
    );
  }

  private assertSameRequest(actualHash: string, expectedHash: string): void {
    if (actualHash !== expectedHash) {
      throw new ResourceConflictException(
        'Idempotency key reused with a different closure request',
        ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
      );
    }
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function privacySafeAuditContext(context: AuditContext): AuditContext {
  return {
    ...context,
    actorEmail: null,
    ip: null,
    userAgent: null,
  };
}
