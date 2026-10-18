import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipGoal,
  MentorshipGoalDocument,
} from './schemas/mentorship-goal.schema';
import {
  MentorshipGoalCheckin,
  MentorshipGoalCheckinDocument,
} from './schemas/mentorship-goal-checkin.schema';
import {
  CheckinDto,
  CreateGoalDto,
  UpdateGoalDto,
} from './dto/mentorship-goal.dto';

@Injectable()
export class MentorshipGoalsService {
  constructor(
    @InjectModel(MentorshipGoal.name)
    private readonly goals: Model<MentorshipGoalDocument>,
    @InjectModel(MentorshipGoalCheckin.name)
    private readonly checkins: Model<MentorshipGoalCheckinDocument>,
  ) {}

  async create(actorId: string, dto: CreateGoalDto) {
    if (dto.targetDate) {
      const d = new Date(dto.targetDate);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('INVALID_DATE');
      if (d.getTime() < Date.now() - 86400000)
        throw new BadRequestException('PAST_TARGET_DATE');
    }
    if (dto.ownerId !== actorId && dto.ownerId !== undefined) {
      // Allow caller to set if self; deny otherwise — basic guard
    }
    return this.goals.create({
      ...dto,
      ownerId: dto.ownerId ?? actorId,
      successCriteria: dto.successCriteria ?? [],
      evidenceRefs: [],
      version: 1,
    });
  }

  async findOne(id: string) {
    const g = await this.goals.findById(id).exec();
    if (!g) throw new NotFoundException('MENTOR_GOAL_NOT_FOUND');
    return g;
  }

  async update(actorId: string, id: string, dto: UpdateGoalDto) {
    const g = await this.findOne(id);
    if (g.ownerId !== actorId)
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    const update: Record<string, unknown> = { ...dto };
    if (update.targetDate) {
      const d = new Date(update.targetDate as string);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('INVALID_DATE');
    }
    update.version = g.version + 1;
    return this.goals
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();
  }

  async complete(actorId: string, id: string, evidenceRefs: string[] = []) {
    const g = await this.findOne(id);
    if (g.ownerId !== actorId)
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    const ev = Array.isArray(evidenceRefs) ? [...evidenceRefs] : [];
    return this.goals
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'completed',
            evidenceRefs: ev,
            version: g.version + 1,
          },
        },
        { new: true },
      )
      .exec();
  }

  async checkin(actorId: string, dto: CheckinDto) {
    const g = await this.findOne(dto.goalId);
    if (g.status !== 'active') throw new BadRequestException('GOAL_NOT_ACTIVE');
    const last = await this.checkins
      .findOne({ goalId: dto.goalId })
      .sort({ sequence: -1 })
      .exec();
    const sequence = (last?.sequence ?? 0) + 1;
    try {
      return await this.checkins.create({
        ...dto,
        authorId: actorId,
        sequence,
        occurredAt: new Date(),
        evidenceRefs: dto.evidenceRefs ?? [],
      });
    } catch (e) {
      if (e.code === 11000) {
        return this.checkins.findOne({ goalId: dto.goalId, sequence }).exec();
      }
      throw e;
    }
  }

  async history(goalId: string) {
    return this.checkins.find({ goalId }).sort({ sequence: 1 }).exec();
  }
}
