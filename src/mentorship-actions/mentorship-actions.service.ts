import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipActionItem,
  MentorshipActionItemDocument,
  ActionItemStatus,
} from './schemas/mentorship-action-item.schema';
import {
  MentorshipMilestone,
  MentorshipMilestoneDocument,
  MilestoneStatus,
} from './schemas/mentorship-milestone.schema';
import {
  CreateActionItemDto,
  CreateMilestoneDto,
  UpdateActionItemDto,
} from './dto/mentorship-action.dto';

@Injectable()
export class MentorshipActionsService {
  constructor(
    @InjectModel(MentorshipActionItem.name)
    private readonly items: Model<MentorshipActionItemDocument>,
    @InjectModel(MentorshipMilestone.name)
    private readonly milestones: Model<MentorshipMilestoneDocument>,
  ) {}

  async createItem(assignerId: string, dto: CreateActionItemDto) {
    const due = dto.dueDate ? new Date(dto.dueDate) : null;
    if (due && Number.isNaN(due.getTime()))
      throw new BadRequestException('INVALID_DATE');
    return this.items.create({
      ...dto,
      assignerId,
      dueDate: due,
      reminders: (dto.reminders ?? []).map((r) => new Date(r)),
      completionEvidence: dto.completionEvidence ?? [],
    });
  }

  async updateItem(actorId: string, id: string, dto: UpdateActionItemDto) {
    const it = await this.items.findById(id).exec();
    if (!it) throw new NotFoundException('ACTION_ITEM_NOT_FOUND');
    if (it.assignerId !== actorId && it.assigneeId !== actorId)
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    const upd: any = { ...dto };
    if (dto.reminders) upd.reminders = dto.reminders.map((r) => new Date(r));
    if (
      dto.status === ActionItemStatus.ACKNOWLEDGED &&
      it.assigneeId === actorId
    ) {
      upd.acknowledgedAt = new Date();
    }
    if (dto.status === ActionItemStatus.COMPLETED) {
      upd.completedAt = new Date();
    }
    return this.items
      .findByIdAndUpdate(id, { $set: upd }, { new: true })
      .exec();
  }

  async getOverdue(now = new Date()) {
    return this.items
      .find({
        dueDate: { $lt: now },
        status: { $ne: ActionItemStatus.COMPLETED },
      })
      .exec();
  }

  async createMilestone(dto: CreateMilestoneDto) {
    const deps = dto.dependencies ?? [];
    if (deps.length > 0) {
      const found = await this.milestones.countDocuments({
        _id: { $in: deps },
      });
      if (found !== deps.length)
        throw new BadRequestException('INVALID_DEPENDENCY');
    }
    const due = new Date(dto.dueDate);
    if (Number.isNaN(due.getTime()))
      throw new BadRequestException('INVALID_DATE');
    const cycle = await this.hasCycle(
      dto.goalId,
      deps,
      dto.dependencies ? deps[deps.length - 1] : null,
    );
    if (cycle) throw new BadRequestException('DEPENDENCY_CYCLE');
    return this.milestones.create({ ...dto, dueDate: due, dependencies: deps });
  }

  async completeMilestone(id: string) {
    const m = await this.milestones.findById(id).exec();
    if (!m) throw new NotFoundException('MILESTONE_NOT_FOUND');
    if (m.dependencies.length > 0) {
      const ok = await this.milestones
        .find({
          _id: { $in: m.dependencies },
          status: { $ne: MilestoneStatus.ACCEPTED },
        })
        .countDocuments();
      if (ok > 0) throw new BadRequestException('BLOCKED_BY_DEPENDENCIES');
    }
    return this.milestones
      .findByIdAndUpdate(
        id,
        { $set: { status: MilestoneStatus.COMPLETED } },
        { new: true },
      )
      .exec();
  }

  private async hasCycle(
    goalId: string,
    deps: string[],
    newNode?: string | null,
  ): Promise<boolean> {
    if (!newNode) return false;
    const seen = new Set<string>();
    const stack = [...deps];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (cur === newNode) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const ms = await this.milestones
        .findById(cur)
        .select('dependencies')
        .exec();
      if (ms?.dependencies?.length) stack.push(...ms.dependencies);
    }
    return false;
  }
}
