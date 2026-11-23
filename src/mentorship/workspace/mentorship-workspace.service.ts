import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import {
  MentorshipWorkspace,
  MentorshipWorkspaceDocument,
  WorkspaceStatus,
} from './schemas/mentorship-workspace.schema';

export interface WorkspaceActor {
  userId: string;
  roles?: string[];
}

@Injectable()
export class MentorshipWorkspaceService {
  constructor(
    @InjectModel(MentorshipWorkspace.name)
    private readonly workspaces: Model<MentorshipWorkspaceDocument>,
  ) {}

  private isStaff(actor: WorkspaceActor): boolean {
    return (actor.roles ?? []).some((r) =>
      ['admin', 'moderator', 'staff'].includes(r),
    );
  }

  private assertCanAccess(
    workspace: MentorshipWorkspaceDocument,
    actor: WorkspaceActor,
  ): void {
    const isParticipant =
      actor.userId === workspace.mentorId ||
      actor.userId === workspace.menteeId;
    if (!isParticipant && !this.isStaff(actor)) {
      throw new ForbiddenException('WORKSPACE_ACCESS_DENIED');
    }
  }

  private assertWritable(workspace: MentorshipWorkspaceDocument): void {
    if (workspace.status === WorkspaceStatus.READ_ONLY) {
      throw new BadRequestException('WORKSPACE_READ_ONLY');
    }
  }

  async create(dto: CreateWorkspaceDto, actor: WorkspaceActor) {
    const existing = await this.workspaces
      .findOne({ sessionId: dto.sessionId })
      .exec();
    if (existing) {
      this.assertCanAccess(existing, actor);
      return existing;
    }
    const isParticipant =
      actor.userId === dto.mentorId || actor.userId === dto.menteeId;
    if (!isParticipant && !this.isStaff(actor)) {
      throw new ForbiddenException('WORKSPACE_ACCESS_DENIED');
    }
    try {
      return await this.workspaces.create({
        ...dto,
        agenda: [],
        sharedGoals: [],
        permittedResources: [],
        attendanceState: {},
        followUpActions: [],
        status: WorkspaceStatus.ACTIVE,
        createdBy: actor.userId,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.workspaces
          .findOne({ sessionId: dto.sessionId })
          .exec();
        if (winner) {
          this.assertCanAccess(winner, actor);
          return winner;
        }
      }
      throw err;
    }
  }

  async getBySession(sessionId: string, actor: WorkspaceActor) {
    const workspace = await this.workspaces.findOne({ sessionId }).exec();
    if (!workspace) throw new NotFoundException('WORKSPACE_NOT_FOUND');
    this.assertCanAccess(workspace, actor);
    return workspace;
  }

  async update(
    sessionId: string,
    dto: UpdateWorkspaceDto,
    actor: WorkspaceActor,
  ) {
    const workspace = await this.getBySession(sessionId, actor);
    this.assertWritable(workspace);

    if (dto.agenda) workspace.agenda = dto.agenda;
    if (dto.sharedGoals) workspace.sharedGoals = dto.sharedGoals;
    if (dto.permittedResources)
      workspace.permittedResources = dto.permittedResources;
    if (dto.attendanceState) workspace.attendanceState = dto.attendanceState;
    if (dto.followUpActions) {
      workspace.followUpActions = dto.followUpActions.map((a) => ({
        id: randomUUID(),
        description: a.description,
        done: a.done ?? false,
        createdBy: actor.userId,
      }));
    }
    await workspace.save();
    return workspace;
  }

  async markReadOnly(sessionId: string, actor: WorkspaceActor) {
    const workspace = await this.getBySession(sessionId, actor);
    if (workspace.status === WorkspaceStatus.READ_ONLY) return workspace;
    workspace.status = WorkspaceStatus.READ_ONLY;
    await workspace.save();
    return workspace;
  }
}
