import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import {
  AuditAction,
  AuditContext,
  AuditService,
  systemAuditContext,
} from '../../common/audit';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  AddMemberDto,
  CreateWorkspaceDto,
  DecideWorkspacePauseDto,
  RequestWorkspacePauseDto,
  ResumeWorkspaceDto,
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
  WorkspaceFundingImpact,
  WorkspacePause,
  WorkspacePauseStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivityDocument,
} from '../schemas/workspace-activity.schema';
import {
  assertNotArchived,
  assertVersion,
  assertWorkspaceTransition,
  isDuplicateKeyError,
  newEntryId,
  normalizeIdempotencyKey,
} from '../support/workspace-rules';
import { PrivateNoteCipher } from '../support/private-note-cipher';
import { WorkspaceAccessService } from './workspace-access.service';

type PlainRecord = Record<string, unknown>;

const MAX_PAUSE_MS = 90 * 24 * 60 * 60 * 1000;

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

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
  const history = Array.isArray(plain.pauseHistory)
    ? (plain.pauseHistory as WorkspacePause[])
    : [];
  delete view.pauseHistory;
  const latestPause = history.at(-1);
  if (latestPause) {
    view.pause = {
      pauseId: latestPause.pauseId,
      status: latestPause.status,
      requestedBy: latestPause.requestedBy,
      requestedAt: latestPause.requestedAt,
      expiresAt: latestPause.expiresAt,
      fundingImpact: latestPause.fundingImpact,
      decidedBy: latestPause.decidedBy,
      decidedAt: latestPause.decidedAt,
      pausedAt: latestPause.pausedAt,
      resumedAt: latestPause.resumedAt,
      expiredAt: latestPause.expiredAt,
      deadlineShiftMs: latestPause.deadlineShiftMs,
      hasReason: Boolean(latestPause.reason?.ciphertext),
      hasDecisionReason: Boolean(latestPause.decisionReason?.ciphertext),
    };
  }
  return view;
}

@Injectable()
export class ProjectWorkspaceService {
  private readonly logger = new Logger(ProjectWorkspaceService.name);

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
    private readonly cipher: PrivateNoteCipher,
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
        deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
        status: WorkspaceStatus.DRAFT,
        members: [
          { userId: actorId, role: WorkspaceRole.OWNER, joinedAt: new Date() },
        ],
        objectives: [],
        milestones: [],
        pauseHistory: [],
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
    if (dto.deadlineAt !== undefined) set.deadlineAt = new Date(dto.deadlineAt);
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
    const workspace = await this.access.loadForMutation(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    if (workspace.status === WorkspaceStatus.ON_HOLD) {
      throw new BusinessRuleException(
        'Use the pause resume operation to leave the on-hold state',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }
    if (
      this.pauseHistory(workspace).some(
        (entry) => entry.status === WorkspacePauseStatus.PENDING,
      )
    ) {
      throw new BusinessRuleException(
        'Resolve the pending pause request before changing project status',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
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

  async requestPause(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: RequestWorkspacePauseDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    const key = normalizeIdempotencyKey(dto.idempotencyKey);
    if (!key) {
      throw new ValidationDomainException(
        'idempotencyKey is required',
        ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      );
    }
    const requestFingerprint = fingerprint({
      actorId,
      reason: dto.reason?.trim(),
      expiresAt: dto.expiresAt,
      fundingImpact:
        dto.fundingImpact ?? WorkspaceFundingImpact.REVIEW_REQUIRED,
    });
    const previous = this.pauseHistory(workspace).find(
      (entry) => entry.requestKey === key,
    );
    if (previous) {
      if (previous.requestFingerprint !== requestFingerprint) {
        throw new BusinessRuleException(
          'Idempotency key was already used with a different pause request',
          ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
        );
      }
      return workspaceView(workspace);
    }

    assertVersion(dto.expectedVersion, workspace.version);
    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Only an active project can request a pause',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }

    const now = new Date();
    const expiresAt = new Date(dto.expiresAt);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() - now.getTime() > MAX_PAUSE_MS
    ) {
      throw new ValidationDomainException(
        'expiresAt must be in the future and no more than 90 days away',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }
    if (!dto.reason?.trim()) {
      throw new ValidationDomainException(
        'A non-empty pause reason is required',
        ErrorCode.VAL_MISSING_FIELD,
      );
    }
    if (
      this.pauseHistory(workspace).some((entry) =>
        [WorkspacePauseStatus.PENDING, WorkspacePauseStatus.ACTIVE].includes(
          entry.status,
        ),
      )
    ) {
      throw new BusinessRuleException(
        'A pause request is already pending or active',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }

    const pauseId = newEntryId('pause');
    const pause: WorkspacePause = {
      pauseId,
      status: WorkspacePauseStatus.PENDING,
      requestedBy: actorId,
      reason: this.cipher.encrypt({
        title: 'project-pause-reason',
        content: dto.reason.trim(),
      }),
      requestedAt: now,
      expiresAt,
      fundingImpact:
        dto.fundingImpact ?? WorkspaceFundingImpact.REVIEW_REQUIRED,
      requestKey: key,
      requestFingerprint,
      decidedBy: null,
      decisionReason: null,
      decisionKey: null,
      decisionFingerprint: null,
      decidedAt: null,
      pausedAt: null,
      resumedAt: null,
      expiredAt: null,
      resumeKey: null,
      resumeFingerprint: null,
      deadlineShiftMs: 0,
    };

    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          version: dto.expectedVersion,
          status: WorkspaceStatus.ACTIVE,
          $and: [
            {
              pauseHistory: {
                $not: {
                  $elemMatch: {
                    status: {
                      $in: [
                        WorkspacePauseStatus.PENDING,
                        WorkspacePauseStatus.ACTIVE,
                      ],
                    },
                  },
                },
              },
            },
            {
              pauseHistory: {
                $not: { $elemMatch: { requestKey: key } },
              },
            },
          ],
        },
        { $push: { pauseHistory: pause }, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      const fresh = await this.workspaces.findById(projectId).exec();
      const replay = fresh
        ? this.pauseHistory(fresh).find((entry) => entry.requestKey === key)
        : undefined;
      if (fresh && replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw new BusinessRuleException(
            'Idempotency key was already used with a different pause request',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return workspaceView(fresh);
      }
      if (fresh && fresh.version !== dto.expectedVersion) {
        assertVersion(dto.expectedVersion, fresh.version);
      }
      throw new BusinessRuleException(
        'The workspace changed or already has an outstanding pause; reload and retry',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }

    await this.audit.record({
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_REQUESTED,
      context: audit,
      target: { type: 'project_workspace', id: projectId },
      after: {
        pauseId,
        status: pause.status,
        expiresAt: expiresAt.toISOString(),
        fundingImpact: pause.fundingImpact,
      },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId,
      actorId,
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_REQUESTED,
      targetType: 'project_workspace_pause',
      targetId: pauseId,
      requestId: audit.requestId,
    });
    return workspaceView(updated);
  }

  async getPause(
    actorId: string,
    projectId: string,
    pauseId: string,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    const pause = this.pauseHistory(workspace).find(
      (entry) => entry.pauseId === pauseId,
    );
    if (!pause) {
      throw new ResourceNotFoundException(
        'Pause request not found',
        ErrorCode.RES_WORKSPACE_PAUSE_NOT_FOUND,
      );
    }
    return {
      pauseId: pause.pauseId,
      status: pause.status,
      requestedBy: pause.requestedBy,
      requestedAt: pause.requestedAt,
      expiresAt: pause.expiresAt,
      fundingImpact: pause.fundingImpact,
      decidedBy: pause.decidedBy,
      decidedAt: pause.decidedAt,
      pausedAt: pause.pausedAt,
      resumedAt: pause.resumedAt,
      expiredAt: pause.expiredAt,
      deadlineShiftMs: pause.deadlineShiftMs,
      reason: this.cipher.decrypt(pause.reason).content,
      decisionReason: pause.decisionReason
        ? this.cipher.decrypt(pause.decisionReason).content
        : null,
    };
  }

  async decidePause(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    pauseId: string,
    dto: DecideWorkspacePauseDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    const key = normalizeIdempotencyKey(dto.idempotencyKey);
    if (!key) {
      throw new ValidationDomainException(
        'idempotencyKey is required',
        ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      );
    }
    const decisionFingerprint = fingerprint({
      actorId,
      pauseId,
      approved: dto.approved,
      decisionReason: dto.decisionReason?.trim() ?? null,
    });
    const pause = this.pauseHistory(workspace).find(
      (entry) => entry.pauseId === pauseId,
    );
    if (!pause) {
      throw new BusinessRuleException(
        'Pause request is no longer available',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }
    if (pause.decisionKey === key) {
      if (pause.decisionFingerprint !== decisionFingerprint) {
        throw new BusinessRuleException(
          'Idempotency key was already used with a different pause decision',
          ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
        );
      }
      return workspaceView(workspace);
    }
    if (pause.requestedBy === actorId) {
      throw new BusinessRuleException(
        'A pause requester cannot approve or reject their own request',
        ErrorCode.BIZ_WORKSPACE_PAUSE_SELF_APPROVAL,
      );
    }
    assertVersion(dto.expectedVersion, workspace.version);
    if (pause.status !== WorkspacePauseStatus.PENDING) {
      throw new BusinessRuleException(
        'Only a pending pause request can be decided',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }
    const now = new Date();
    if (pause.expiresAt.getTime() <= now.getTime()) {
      throw new BusinessRuleException(
        'The pause request has expired and cannot be approved',
        ErrorCode.BIZ_WORKSPACE_PAUSE_EXPIRED,
      );
    }
    if (!dto.approved && !dto.decisionReason?.trim()) {
      throw new ValidationDomainException(
        'A non-empty decisionReason is required when rejecting a pause',
        ErrorCode.VAL_MISSING_FIELD,
      );
    }

    const nextPauseStatus = dto.approved
      ? WorkspacePauseStatus.ACTIVE
      : WorkspacePauseStatus.REJECTED;
    const set: Record<string, unknown> = {
      'pauseHistory.$.status': nextPauseStatus,
      'pauseHistory.$.decidedBy': actorId,
      'pauseHistory.$.decisionReason': dto.decisionReason?.trim()
        ? this.cipher.encrypt({
            title: 'project-pause-decision',
            content: dto.decisionReason.trim(),
          })
        : null,
      'pauseHistory.$.decisionKey': key,
      'pauseHistory.$.decisionFingerprint': decisionFingerprint,
      'pauseHistory.$.decidedAt': now,
    };
    if (dto.approved) {
      set.status = WorkspaceStatus.ON_HOLD;
      set['pauseHistory.$.pausedAt'] = now;
    }

    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: projectId,
          version: dto.expectedVersion,
          status: WorkspaceStatus.ACTIVE,
          pauseHistory: {
            $elemMatch: {
              pauseId,
              status: WorkspacePauseStatus.PENDING,
              requestedBy: { $ne: actorId },
              expiresAt: { $gt: now },
            },
          },
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      const fresh = await this.workspaces.findById(projectId).exec();
      const latest = fresh
        ? this.pauseHistory(fresh).find((entry) => entry.pauseId === pauseId)
        : undefined;
      if (fresh && latest?.decisionKey === key) {
        if (latest.decisionFingerprint !== decisionFingerprint) {
          throw new BusinessRuleException(
            'Idempotency key was already used with a different pause decision',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return workspaceView(fresh);
      }
      if (fresh && fresh.version !== dto.expectedVersion) {
        assertVersion(dto.expectedVersion, fresh.version);
      }
      if (latest?.expiresAt && latest.expiresAt.getTime() <= now.getTime()) {
        throw new BusinessRuleException(
          'The pause request has expired and cannot be approved',
          ErrorCode.BIZ_WORKSPACE_PAUSE_EXPIRED,
        );
      }
      throw new BusinessRuleException(
        'Pause request changed before the decision was recorded',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }

    await this.audit.record({
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_DECIDED,
      context: audit,
      target: { type: 'project_workspace', id: projectId },
      after: { pauseId, status: nextPauseStatus },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId,
      actorId,
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_DECIDED,
      targetType: 'project_workspace_pause',
      targetId: pauseId,
      requestId: audit.requestId,
    });
    if (dto.approved) {
      this.events.emit('project-workspace.pause.approved', {
        eventId: `${pauseId}:approved`,
        tenantId: workspace.tenantId,
        projectId,
        pauseId,
        expiresAt: pause.expiresAt.toISOString(),
        fundingImpact: pause.fundingImpact,
      });
    }
    return workspaceView(updated);
  }

  async resume(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: ResumeWorkspaceDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    const key = normalizeIdempotencyKey(dto.idempotencyKey);
    if (!key) {
      throw new ValidationDomainException(
        'idempotencyKey is required',
        ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      );
    }
    const replay = this.pauseHistory(workspace).find(
      (entry) => entry.resumeKey === key,
    );
    if (replay) {
      const replayFingerprint = fingerprint({
        actorId,
        pauseId: replay.pauseId,
      });
      if (replay.resumeFingerprint !== replayFingerprint) {
        throw new BusinessRuleException(
          'Idempotency key was already used with a different resume request',
          ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
        );
      }
      return workspaceView(workspace);
    }

    assertVersion(dto.expectedVersion, workspace.version);
    const pause = this.activePause(workspace);
    if (!pause || workspace.status !== WorkspaceStatus.ON_HOLD) {
      throw new BusinessRuleException(
        'Only an actively paused project can be resumed',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }
    const resumeFingerprint = fingerprint({
      actorId,
      pauseId: pause.pauseId,
    });
    const now = new Date();
    const outcome =
      pause.expiresAt.getTime() <= now.getTime() ? 'expired' : 'resumed';
    const updated = await this.completePause(
      workspace,
      pause,
      actorId,
      audit,
      key,
      resumeFingerprint,
      now,
      outcome,
    );
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
          status: { $ne: WorkspaceStatus.ARCHIVED },
          'members.userId': { $ne: dto.userId },
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

  @Cron(CronExpression.EVERY_MINUTE, { name: 'project-workspace-pause-expiry' })
  async processExpiredPauses(limit = 100): Promise<number> {
    const now = new Date();
    const workspaces = await this.workspaces
      .find({
        $or: [
          {
            status: WorkspaceStatus.ACTIVE,
            pauseHistory: {
              $elemMatch: {
                status: WorkspacePauseStatus.PENDING,
                expiresAt: { $lte: now },
              },
            },
          },
          {
            status: WorkspaceStatus.ON_HOLD,
            pauseHistory: {
              $elemMatch: {
                status: WorkspacePauseStatus.ACTIVE,
                expiresAt: { $lte: now },
              },
            },
          },
        ],
      })
      .limit(limit)
      .exec();
    let processed = 0;

    for (const workspace of workspaces) {
      try {
        const expiredRequest = this.pauseHistory(workspace).find(
          (entry) =>
            entry.status === WorkspacePauseStatus.PENDING &&
            entry.expiresAt.getTime() <= now.getTime(),
        );
        if (expiredRequest) {
          const updated = await this.workspaces
            .findOneAndUpdate(
              {
                _id: workspace._id,
                version: workspace.version,
                status: WorkspaceStatus.ACTIVE,
                pauseHistory: {
                  $elemMatch: {
                    pauseId: expiredRequest.pauseId,
                    status: WorkspacePauseStatus.PENDING,
                    expiresAt: { $lte: now },
                  },
                },
              },
              {
                $set: {
                  'pauseHistory.$.status': WorkspacePauseStatus.EXPIRED,
                  'pauseHistory.$.expiredAt': now,
                },
                $inc: { version: 1 },
              },
              { new: true, runValidators: true },
            )
            .exec();
          if (updated) {
            const context = systemAuditContext(
              `workspace-pause-expiry:${expiredRequest.pauseId}`,
            );
            await this.audit.record({
              action: AuditAction.PROJECT_WORKSPACE_PAUSE_DECIDED,
              context,
              target: {
                type: 'project_workspace',
                id: String(workspace._id),
              },
              after: {
                pauseId: expiredRequest.pauseId,
                status: WorkspacePauseStatus.EXPIRED,
              },
            });
            this.events.emit('workspace.activity.recorded', {
              tenantId: workspace.tenantId,
              projectId: String(workspace._id),
              actorId: 'system',
              action: AuditAction.PROJECT_WORKSPACE_PAUSE_DECIDED,
              targetType: 'project_workspace_pause',
              targetId: expiredRequest.pauseId,
              requestId: context.requestId,
            });
            processed += 1;
          }
          continue;
        }

        const expiredPause = this.pauseHistory(workspace).find(
          (entry) =>
            entry.status === WorkspacePauseStatus.ACTIVE &&
            entry.expiresAt.getTime() <= now.getTime(),
        );
        if (expiredPause) {
          const result = await this.completePause(
            workspace,
            expiredPause,
            'system',
            systemAuditContext(
              `workspace-pause-expiry:${expiredPause.pauseId}`,
            ),
            null,
            null,
            now,
            'expired',
            true,
          );
          if (result) processed += 1;
        }
      } catch (error) {
        this.logger.error(
          `Pause expiry failed for workspaceId=${String(workspace._id)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (processed > 0) {
      this.logger.log(`Expired project pause records processed=${processed}`);
    }
    return processed;
  }

  private pauseHistory(workspace: ProjectWorkspace): WorkspacePause[] {
    return workspace.pauseHistory ?? [];
  }

  private activePause(workspace: ProjectWorkspace): WorkspacePause | undefined {
    return this.pauseHistory(workspace).find(
      (entry) => entry.status === WorkspacePauseStatus.ACTIVE,
    );
  }

  private async completePause(
    workspace: ProjectWorkspaceDocument,
    pause: WorkspacePause,
    actorId: string,
    audit: AuditContext,
    resumeKey: string | null,
    resumeFingerprint: string | null,
    resumedAt: Date,
    outcome: 'resumed' | 'expired',
    scheduled = false,
  ): Promise<ProjectWorkspaceDocument | null> {
    const pausedAt = new Date(pause.pausedAt ?? resumedAt);
    const deadlineShiftMs = Math.max(
      0,
      resumedAt.getTime() - pausedAt.getTime(),
    );
    const shiftDate = (date: Date | null | undefined): Date | null => {
      if (!date) return null;
      const timestamp = new Date(date).getTime();
      return Number.isNaN(timestamp)
        ? null
        : new Date(timestamp + deadlineShiftMs);
    };
    const set: Record<string, unknown> = {
      status: WorkspaceStatus.ACTIVE,
      'pauseHistory.$.status':
        outcome === 'expired'
          ? WorkspacePauseStatus.EXPIRED
          : WorkspacePauseStatus.RESUMED,
      'pauseHistory.$.resumedAt': resumedAt,
      'pauseHistory.$.expiredAt': outcome === 'expired' ? resumedAt : null,
      'pauseHistory.$.resumeKey': resumeKey,
      'pauseHistory.$.resumeFingerprint': resumeFingerprint,
      'pauseHistory.$.deadlineShiftMs': deadlineShiftMs,
    };
    if (workspace.deadlineAt) set.deadlineAt = shiftDate(workspace.deadlineAt);
    set.objectives = (workspace.objectives ?? []).map((objective) => ({
      id: objective.id,
      title: objective.title,
      status: objective.status,
      dueAt: shiftDate(objective.dueAt),
    }));
    set.milestones = (workspace.milestones ?? []).map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      dueAt: shiftDate(milestone.dueAt),
      complete: milestone.complete,
    }));

    const updated = await this.workspaces
      .findOneAndUpdate(
        {
          _id: workspace._id,
          version: workspace.version,
          status: WorkspaceStatus.ON_HOLD,
          pauseHistory: {
            $elemMatch: {
              pauseId: pause.pauseId,
              status: WorkspacePauseStatus.ACTIVE,
            },
          },
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      if (scheduled) return null;
      const fresh = await this.workspaces.findById(workspace._id).exec();
      const replay = fresh
        ? this.pauseHistory(fresh).find(
            (entry) => entry.resumeKey === resumeKey,
          )
        : undefined;
      if (fresh && replay) {
        if (replay.resumeFingerprint !== resumeFingerprint) {
          throw new BusinessRuleException(
            'Idempotency key was already used with a different resume request',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return fresh;
      }
      if (fresh && fresh.version !== workspace.version) {
        assertVersion(workspace.version, fresh.version);
      }
      throw new BusinessRuleException(
        'The pause changed before it could be resumed; reload and retry',
        ErrorCode.BIZ_WORKSPACE_PAUSE_INVALID,
      );
    }

    await this.audit.record({
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_RESUMED,
      context: audit,
      target: {
        type: 'project_workspace',
        id: String(workspace._id),
      },
      after: {
        pauseId: pause.pauseId,
        status:
          outcome === 'expired'
            ? WorkspacePauseStatus.EXPIRED
            : WorkspacePauseStatus.RESUMED,
        deadlineShiftMs,
      },
    });
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId: String(workspace._id),
      actorId,
      action: AuditAction.PROJECT_WORKSPACE_PAUSE_RESUMED,
      targetType: 'project_workspace_pause',
      targetId: pause.pauseId,
      requestId: audit.requestId,
    });
    this.events.emit('project-workspace.pause.resumed', {
      eventId: `${pause.pauseId}:resumed`,
      tenantId: workspace.tenantId,
      projectId: String(workspace._id),
      pauseId: pause.pauseId,
      outcome,
      resumedAt: resumedAt.toISOString(),
      deadlineShiftMs,
      fundingImpact: pause.fundingImpact,
    });
    return updated;
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
          status: { $ne: WorkspaceStatus.ARCHIVED },
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
