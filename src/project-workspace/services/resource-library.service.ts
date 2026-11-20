import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditContext, AuditService } from '../../common/audit';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  CreateResourceDto,
  ReviewResourceDto,
  UpdateResourceDto,
} from '../dto/project-workspace.dto';
import {
  ProjectResource,
  ProjectResourceDocument,
  ResourceAccessPolicy,
  ResourceKind,
  ResourceStatus,
} from '../schemas/project-resource.schema';
import {
  ProjectWorkspaceDocument,
  WorkspaceRole,
} from '../schemas/project-workspace.schema';
import {
  assertResourceTransition,
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

function resourceView(value: unknown): PlainRecord {
  const plain = toPlain(value);
  const view: PlainRecord = { ...plain, id: String(plain._id) };
  delete view._id;
  delete view.__v;
  delete view.idempotencyKey;
  return view;
}

@Injectable()
export class ResourceLibraryService {
  constructor(
    @InjectModel(ProjectResource.name)
    private readonly resources: Model<ProjectResourceDocument>,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async submit(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    dto: CreateResourceDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
    ]);
    this.assertUri(dto.kind, dto.uri);

    const idempotencyKey = normalizeIdempotencyKey(dto.idempotencyKey);
    if (idempotencyKey) {
      const replay = await this.resources
        .findOne({ tenantId: workspace.tenantId, projectId, idempotencyKey })
        .exec();
      if (replay) return resourceView(replay);
    }

    let created: unknown;
    try {
      created = await this.resources.create({
        tenantId: workspace.tenantId,
        projectId,
        kind: dto.kind,
        name: dto.name,
        uri: dto.uri,
        mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes ?? null,
        checksumSha256: dto.checksumSha256,
        license: dto.license ?? null,
        citations: dto.citations ?? [],
        accessPolicy: dto.accessPolicy ?? ResourceAccessPolicy.PRIVATE,
        status: ResourceStatus.PENDING,
        submittedBy: actorId,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        previousVersions: [],
        version: 1,
        idempotencyKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error) && idempotencyKey) {
        const replay = await this.resources
          .findOne({ tenantId: workspace.tenantId, projectId, idempotencyKey })
          .exec();
        if (replay) return resourceView(replay);
      }
      if (isDuplicateKeyError(error)) {
        throw new ResourceConflictException(
          'Resource with this checksum is already registered for the project',
          ErrorCode.BIZ_WORKSPACE_RESOURCE_DUPLICATE,
        );
      }
      throw error;
    }

    const view = resourceView(created);
    await this.audit.record({
      action: 'project_resource.submitted',
      context: audit,
      target: { type: 'project_resource', id: view.id as string },
      after: { id: view.id, projectId, kind: dto.kind },
    });
    this.emit(
      workspace,
      actorId,
      audit,
      'project_resource.submitted',
      view.id as string,
    );
    return view;
  }

  async list(actorId: string, projectId: string): Promise<PlainRecord[]> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const resources = await this.resources
      .find({ tenantId: workspace.tenantId, projectId })
      .sort({ createdAt: -1 })
      .exec();
    return resources
      .filter((resource) => this.canView(resource, workspace, actorId))
      .map(resourceView);
  }

  async findOne(
    actorId: string,
    projectId: string,
    resourceId: string,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
      WorkspaceRole.VIEWER,
    ]);
    const resource = await this.resources
      .findOne({ _id: resourceId, tenantId: workspace.tenantId, projectId })
      .exec();
    if (!resource || !this.canView(resource, workspace, actorId)) {
      throw new ResourceNotFoundException(
        'Project resource not found',
        ErrorCode.RES_WORKSPACE_RESOURCE_NOT_FOUND,
      );
    }
    return resourceView(resource);
  }

  async update(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.EDITOR,
    ]);
    const resource = await this.ownedResource(workspace, projectId, resourceId);
    if (
      resource.status !== ResourceStatus.PENDING &&
      resource.status !== ResourceStatus.REJECTED
    ) {
      throw new BusinessRuleException(
        'Only pending or rejected resources can be revised; create a new version for approved resources',
        ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
      );
    }
    if (dto.uri) this.assertUri(resource.kind, dto.uri);
    const set: PlainRecord = {};
    for (const field of [
      'uri',
      'checksumSha256',
      'accessPolicy',
      'license',
      'citations',
    ] as const) {
      if (dto[field] !== undefined) set[field] = dto[field];
    }
    const updated = await this.resources
      .findOneAndUpdate(
        {
          _id: resourceId,
          tenantId: workspace.tenantId,
          projectId,
          version: dto.expectedVersion,
          status: { $in: [ResourceStatus.PENDING, ResourceStatus.REJECTED] },
        },
        {
          $set: set,
          $push: {
            previousVersions: {
              version: resource.version,
              uri: resource.uri,
              checksumSha256: resource.checksumSha256,
              recordedAt: new Date(),
            },
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessRuleException(
        `Expected resource version ${dto.expectedVersion} but found ${resource.version}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected: dto.expectedVersion, actual: resource.version },
      );
    }

    await this.audit.record({
      action: 'project_resource.submitted',
      context: audit,
      target: { type: 'project_resource', id: resourceId },
      after: { id: resourceId, projectId, fields: Object.keys(set) },
    });
    this.emit(
      workspace,
      actorId,
      audit,
      'project_resource.submitted',
      resourceId,
    );
    return resourceView(updated);
  }

  async approve(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    resourceId: string,
    dto: ReviewResourceDto,
  ): Promise<PlainRecord> {
    return this.review(
      actorId,
      audit,
      projectId,
      resourceId,
      dto,
      ResourceStatus.APPROVED,
    );
  }

  async reject(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    resourceId: string,
    dto: ReviewResourceDto,
  ): Promise<PlainRecord> {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new ValidationDomainException(
        'A rejection reason of at least 5 characters is required',
        ErrorCode.VAL_MISSING_FIELD,
      );
    }
    return this.review(
      actorId,
      audit,
      projectId,
      resourceId,
      dto,
      ResourceStatus.REJECTED,
    );
  }

  async archive(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    resourceId: string,
    dto: ReviewResourceDto,
  ): Promise<PlainRecord> {
    return this.review(
      actorId,
      audit,
      projectId,
      resourceId,
      dto,
      ResourceStatus.ARCHIVED,
    );
  }

  private async review(
    actorId: string,
    audit: AuditContext,
    projectId: string,
    resourceId: string,
    dto: ReviewResourceDto,
    to: ResourceStatus,
  ): Promise<PlainRecord> {
    const workspace = await this.access.load(projectId, actorId, [
      WorkspaceRole.OWNER,
    ]);
    const resource = await this.ownedResource(workspace, projectId, resourceId);
    assertResourceTransition(resource.status, to);

    const updated = await this.resources
      .findOneAndUpdate(
        {
          _id: resourceId,
          tenantId: workspace.tenantId,
          projectId,
          version: dto.expectedVersion,
          status: resource.status,
        },
        {
          $set: {
            status: to,
            reviewedBy: actorId,
            reviewedAt: new Date(),
            rejectionReason:
              to === ResourceStatus.REJECTED ? (dto.reason ?? null) : null,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessRuleException(
        `Expected resource version ${dto.expectedVersion} but found ${resource.version}`,
        ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
        { expected: dto.expectedVersion, actual: resource.version },
      );
    }

    const action =
      to === ResourceStatus.APPROVED
        ? 'project_resource.approved'
        : to === ResourceStatus.REJECTED
          ? 'project_resource.rejected'
          : 'project_resource.archived';
    await this.audit.record({
      action,
      context: audit,
      target: { type: 'project_resource', id: resourceId },
      after: { id: resourceId, projectId, status: to },
    });
    this.emit(workspace, actorId, audit, action, resourceId);
    return resourceView(updated);
  }

  private async ownedResource(
    workspace: ProjectWorkspaceDocument,
    projectId: string,
    resourceId: string,
  ): Promise<ProjectResourceDocument> {
    const resource = await this.resources
      .findOne({
        _id: resourceId,
        tenantId: workspace.tenantId,
        projectId,
      })
      .exec();
    if (!resource) {
      throw new ResourceNotFoundException(
        'Project resource not found',
        ErrorCode.RES_WORKSPACE_RESOURCE_NOT_FOUND,
      );
    }
    return resource;
  }

  private canView(
    resource: ProjectResourceDocument,
    workspace: ProjectWorkspaceDocument,
    actorId: string,
  ): boolean {
    if (resource.status === ResourceStatus.ARCHIVED) {
      return (
        resource.submittedBy === actorId || this.isOwner(workspace, actorId)
      );
    }
    if (resource.status !== ResourceStatus.APPROVED) {
      return (
        resource.submittedBy === actorId || this.isOwner(workspace, actorId)
      );
    }
    if (resource.accessPolicy === ResourceAccessPolicy.PRIVATE) {
      return (
        resource.submittedBy === actorId || this.isOwner(workspace, actorId)
      );
    }
    return true;
  }

  private isOwner(
    workspace: ProjectWorkspaceDocument,
    actorId: string,
  ): boolean {
    return (workspace.members ?? []).some(
      (member) =>
        member.userId === actorId && member.role === WorkspaceRole.OWNER,
    );
  }

  private assertUri(kind: ResourceKind, uri: string): void {
    if (kind === ResourceKind.LINK && !/^https:\/\/\S+$/i.test(uri)) {
      throw new ValidationDomainException(
        'Linked resources must use an https URL',
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }
    if (/^(javascript|data|file|vbscript):/i.test(uri)) {
      throw new ValidationDomainException(
        'Resource URI uses a disallowed scheme',
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }
    if (kind !== ResourceKind.LINK && uri.includes('<')) {
      throw new ValidationDomainException(
        'Resource URI contains unsafe characters',
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }
  }

  private emit(
    workspace: ProjectWorkspaceDocument,
    actorId: string,
    audit: AuditContext,
    action: string,
    resourceId: string,
  ): void {
    this.events.emit('workspace.activity.recorded', {
      tenantId: workspace.tenantId,
      projectId: String(workspace._id),
      actorId,
      action,
      targetType: 'project_resource',
      targetId: resourceId,
      requestId: audit.requestId,
    });
  }
}
