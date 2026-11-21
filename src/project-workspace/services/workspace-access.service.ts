import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ProjectWorkspace,
  ProjectWorkspaceDocument,
  WorkspaceRole,
} from '../schemas/project-workspace.schema';
import { assertNotArchived, requireMember } from '../support/workspace-rules';

/**
 * Single choke point for loading a parent workspace. Every sub-resource
 * service uses it, so tenant boundaries and role checks cannot be skipped by
 * an endpoint that forgets to implement them locally.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(
    @InjectModel(ProjectWorkspace.name)
    private readonly workspaces: Model<ProjectWorkspaceDocument>,
  ) {}

  async load(
    projectId: string,
    actorId: string,
    roles: WorkspaceRole[],
  ): Promise<ProjectWorkspaceDocument> {
    const workspace = await this.workspaces.findById(projectId).exec();
    if (!workspace) {
      throw new ResourceNotFoundException(
        'Project workspace not found',
        ErrorCode.RES_WORKSPACE_NOT_FOUND,
      );
    }
    requireMember(workspace, actorId, roles);
    return workspace;
  }

  async loadForMutation(
    projectId: string,
    actorId: string,
    roles: WorkspaceRole[],
  ): Promise<ProjectWorkspaceDocument> {
    const workspace = await this.load(projectId, actorId, roles);
    assertNotArchived(workspace);
    if (workspace.terminationProposal) {
      throw new BusinessRuleException(
        'Workspace changes are paused while mutual termination is pending',
        ErrorCode.BIZ_WORKSPACE_CLOSURE_PENDING,
      );
    }
    return workspace;
  }
}
