import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditContext, AuditService } from '../../common/audit';
import {
  BusinessRuleException,
  ResourceConflictException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  AddMemberDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceStatusDto,
} from '../dto/project-workspace.dto';
import {
  NoteStatus,
  ProjectNote,
  ProjectNoteDocument,
} from '../schemas/project-note.schema';
import {
  ProjectResource,
  ProjectResourceDocument,
  ResourceStatus,
} from '../schemas/project-resource.schema';
import {
  ProjectWorkspace,
  ProjectWorkspaceDocument,
  ProjectClosureReason,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivityDocument,
} from '../schemas/workspace-activity.schema';
import {
  assertNotArchived,
  assertWorkspaceTransition,
  isDuplicateKeyError,
  normalizeIdempotencyKey,
} from '../support/workspace-rules';
import { WorkspaceAccessService } from './workspace-access.service';

type PlainRecord = Record<string, unknown>;

function toPlain(value: unknown): PlainRecord {
  const candidate = value as { toObject?: () => PlainRecord } | null;
  if (candidate && typeof candidate.toObject === 'function') {
    return candidate.toObject();
  }
  return { ...(value as PlainRecord) };
}

function workspaceView(value: unknown): PlainRecord {
  const plain = toPlain(value);
  const view: PlainRecord = { ...plain, id: String(plain._id) };
  delete view._id;
  delete view.__v;
  delete view.idempotencyKey;
  const closure = view.closure as PlainRecord | null | undefined;
  const proposal = view.terminationProposal as PlainRecord | null | undefined;
  delete view.closure;
  delete view.terminationProposal;
  return {
    ...view,
    ...(closure && {
      closure: {
        reason: closure.reason,
        outcome: closure.outcome,
        closedAt: closure.closedAt,
      },
    }),
    ...(proposal && {
      terminationProposal: {
        reason: ProjectClosureReason.MUTUAL_TERMINATION,
        initiatedAt: proposal.initiatedAt,
        consentsReceived: Array.isArray(proposal.consents)
          ? proposal.consents.length
          : 0,
        consentsRequired: Array.isArray(plain.members)
          ? new Set(
              (plain.members as Array<{ userId: string }>).map(
                (member) => member.userId,
              ),
            ).size
          : 0,
      },
    }),
  };
}

@Injectable()
export class ProjectWorkspaceService {
  constructor(
    @InjectModel(ProjectWorkspace.name)
    private readonly workspaces: Model<ProjectWorkspaceDocument>,
    @InjectModel(ProjectNote.name)
    private readonly notes: Model<ProjectNoteDocument>,
    @InjectModel(ProjectResource.name)
    private readonly resources: Model<ProjectResourceDocument>,
    @InjectModel(WorkspaceActivity.name)
    private readonly activity: Model<WorkspaceActivityDocument>,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    actorId: string,
    audit: AuditContext,
    dto: CreateWorkspaceDto,
  ): Promise<PlainRecord> {
    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (idempotencyKey) {
      const replay = await this.workspaces
        .findOne({ tenantId: dto.tenantId, idempotencyKey })
        .exec();
      if (replay) return workspaceView(replay);
    }

    let created: unknown;
    try {
      created = await this.workspaces.create({
        tenantId: dto.tenantId,
        key: dto.key,
        title: dto.title,
        summary: dto.summary ?? null,
        status: WorkspaceStatus.DRAFT,
        members: [
          { userId: actorId, role: WorkspaceRole.OWNER, joinedAt: new Date() },
        ],
        objectives: [],
        milestones: [],
        nextActions: [],
        version: 1,
        idempotencyKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error) && idempotencyKey) {
        const replay = await this.workspaces
          .findOne({ tenantId: dto.tenantId, idempotencyKey })
          .exec();
        if (replay) return workspaceView(replay);
      }
      throw error;
    }

    const view = workspaceView(created);
    await this.audit.record({
      action: 'project_workspace.created',
      context: audit,
      target: { type: 'project_workspace', id: view.id as string },
      after: { id: view.id, tenantId: dto.tenantId, key: dto.key },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: dto.tenantId,
      projectId: view.id,
      actorId,
      action: 'project_workspace.created',
      targetType: 'project_workspace',
      targetId: view.id,
      requestId: audit.requestId,
    });
    return view;
  }

  async findOne(actorId: string, projectId: string): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
      WorkspaceRole.SPONSOR,
    ]);
    return workspaceView(workspace);
  }

  async list(actorId: string, tenantId: string): Promise<PlainRecord[]> {
    const workspaces = await this.workspaces
      .find({ tenantId, 'members.userId': actorId })
      .exec();
    return workspaces.map(workspaceView);
  }

  async update(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
    ]);
    assertNotArchived(workspace);

    const set: PlainRecord = {};
    if (dto.title !== undefined) set.title = dto.title;
    if (dto.summary !== undefined) set.summary = dto.summary;
    if (dto.objectives !== undefined) {
      set.objectives = dto.objectives.map((objective) => ({
        id: objective.id,
        title: objective.title,
        status: objective.status ?? 'planned',
        dueAt: objective.dueAt ? new Date(objective.dueAt) : null,
      }));
    }
    if (dto.milestones !== undefined) {
      set.milestones = dto.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        dueAt: milestone.dueAt ? new Date(milestone.dueAt) : null,
        complete: milestone.complete ?? false,
      }));
    }
    if (dto.nextActions !== undefined) set.nextActions = dto.nextActions;

    const updated = await this.applyVersionedUpdate(
      projectId,
      workspace.version,
      dto.expectedVersion,
      { $set: set },
    );

    await this.audit.record({
      action: 'project_workspace.updated',
      context: audit,
      target: { type: 'project_workspace', id: projectId },
      after: { id: projectId, fields: Object.keys(set) },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId,
      actorId,
      action: 'project_workspace.updated',
      targetType: 'project_workspace',
      targetId: projectId,
      requestId: audit.requestId,
    });
    return workspaceView(updated);
  }

  async changeStatus(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: WorkspaceStatusDto,
  ): Promise<PlainRecord> {
    if (dto.status === WorkspaceStatus.ARCHIVED) {
      const completedWorkspace = await this.access.load(
        projectId,
        actorId,
        [WorkspaceRole.OWNER],
      );
      if (completedWorkspace.status === WorkspaceStatus.COMPLETED) {
        assertWorkspaceTransition(
          completedWorkspace.status,
          WorkspaceStatus.ARCHIVED,
        );
        if (dto.expectedVersion !== completedWorkspace.version) {
          throw new BusinessRuleException(
            `Expected workspace version ${dto.expectedVersion} but found ${completedWorkspace.version}`,
            ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
            {
              expected: dto.expectedVersion,
              actual: completedWorkspace.version,
            },
          );
        }
        const archived = await this.workspaces
          .findOneAndUpdate(
            {
              _id: projectId,
              tenantId: completedWorkspace.tenantId,
              version: dto.expectedVersion,
              status: WorkspaceStatus.COMPLETED,
            },
            {
              $set: { status: WorkspaceStatus.ARCHIVED },
              $inc: { version: 1 },
            },
            { new: true, runValidators: true },
          )
          .exec();
        if (!archived) {
          const fresh = await this.workspaces.findById(projectId).exec();
          if (fresh && fresh.version !== dto.expectedVersion) {
            throw new BusinessRuleException(
              `Expected workspace version ${dto.expectedVersion} but found ${fresh.version}`,
              ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
              { expected: dto.expectedVersion, actual: fresh.version },
            );
          }
          throw new BusinessRuleException(
            'Workspace changed concurrently; reload and retry',
            ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
          );
        }

        await this.audit.record({
          action: 'project_workspace.status_changed',
          context: audit,
          target: { type: 'project_workspace', id: projectId },
          before: { status: completedWorkspace.status },
          after: { id: projectId, status: WorkspaceStatus.ARCHIVED },
        });
        this.events.emit('workspace.activity.recorded', {
          tenantId: completedWorkspace.tenantId,
          projectId,
          actorId,
          action: 'project_workspace.status_changed',
          targetType: 'project_workspace',
          targetId: projectId,
          requestId: audit.requestId,
        });
        return workspaceView(archived);
      }

      if (completedWorkspace.status === WorkspaceStatus.ARCHIVED) {
        throw new BusinessRuleException(
          'Archived workspaces are immutable',
          ErrorCode.BIZ_WORKSPACE_ARCHIVED,
        );
      }
      throw new BusinessRuleException(
        'Use the project closure endpoint to terminate a workspace',
        ErrorCode.BIZ_WORKSPACE_CLOSURE_REQUIRED,
      );
    }

    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    if (dto.status === WorkspaceStatus.COMPLETED) {
      throw new BusinessRuleException(
        'Use the project closure endpoint to complete a workspace',
        ErrorCode.BIZ_WORKSPACE_CLOSURE_REQUIRED,
      );
    }
    assertWorkspaceTransition(workspace.status, dto.status);

    const updated = await this.applyVersionedUpdate(
      projectId,
      workspace.version,
      dto.expectedVersion,
      { $set: { status: dto.status } },
    );

    await this.audit.record({
      action: 'project_workspace.status_changed',
      context: audit,
      target: { type: 'project_workspace', id: projectId },
      after: { id: projectId, status: dto.status },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId,
      actorId,
      action: 'project_workspace.status_changed',
      targetType: 'project_workspace',
      targetId: projectId,
      requestId: audit.requestId,
    });
    return workspaceView(updated);
  }

  async addMember(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: AddMemberDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    assertNotArchived(workspace);
    if (
      (workspace.members ?? []).some((member) => member.userId === dto.userId)
    ) {
      throw new ResourceConflictException(
        'User is already a member of this workspace',
        ErrorCode.BIZ_WORKSPACE_MEMBER_CONFLICT,
      );
    }

    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          status: {
            $nin: [WorkspaceStatus.ARCHIVED, WorkspaceStatus.COMPLETED],
          },
          'members.userId': { $ne: dto.userId },
          closure: null,
          terminationProposal: null,
        },
        {
          $addToSet: {
            members: {
              userId: dto.userId,
              role: dto.role,
              joinedAt: new Date(),
            },
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new ResourceConflictException(
        'Membership changed concurrently; reload and retry',
        ErrorCode.BIZ_WORKSPACE_MEMBER_CONFLICT,
      );
    }

    await this.audit.record({
      action: 'project_workspace.member_added',
      context: audit,
      target: { type: 'project_workspace', id: projectId },
      after: { id: projectId, userId: dto.userId, role: dto.role },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId,
      actorId,
      action: 'project_workspace.member_added',
      targetType: 'project_workspace_member',
      targetId: dto.userId,
      requestId: audit.requestId,
    });
    return workspaceView(updated);
  }

  async overview(actorId: string, projectId: string): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
      WorkspaceRole.SPONSOR,
    ]);
    const [sharedNotes, approvedResources, recentActivity] = await Promise.all([
      this.notes.countDocuments({
        tenantId: workspace.tenantId,
        projectId,
        status: { $ne: NoteStatus.ARCHIVED },
      }),
      this.resources.countDocuments({
        tenantId: workspace.tenantId,
        projectId,
        status: ResourceStatus.APPROVED,
      }),
      this.activity
        .find({ tenantId: workspace.tenantId, projectId })
        .sort({ createdAt: -1 })
        .limit(20)
        .exec(),
    ]);

    return {
      ...workspaceView(workspace),
      counts: { sharedNotes, approvedResources },
      recentActivity: recentActivity.map((entry) => ({
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        actorId: entry.actorId,
        at: entry.createdAt,
      })),
    };
  }

  private async applyVersionedUpdate(
    projectId: string,
    actualVersion: number,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<unknown> {
    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          version: expectedVersion,
          status: {
            $nin: [WorkspaceStatus.ARCHIVED, WorkspaceStatus.COMPLETED],
          },
          closure: null,
          terminationProposal: null,
        },
        { ...update, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (updated) return updated;

    const fresh = await this.workspaces.findById(projectId).exec();
    if (fresh && fresh.version !== expectedVersion) {
      throw new BusinessRuleException(
        `Expected version ${expectedVersion} but found ${fresh.version}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected: expectedVersion, actual: fresh.version },
      );
    }
    throw new BusinessRuleException(
      'Workspace changed concurrently or is archived; reload and retry',
      ErrorCode.BIZ_WORKSPACE_ARCHIVED,
    );
  }
}
