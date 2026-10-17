import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
  MentorshipProgramStatus,
} from './mentorship-program.schema';
import { CreateMentorshipProgramDto } from './dto/mentorship-program.dto';

@Injectable()
export class MentorshipProgramService {
  constructor(
    @InjectModel(MentorshipProgram.name)
    private readonly programs: Model<MentorshipProgramDocument>,
  ) {}

  async create(mentorId: string, dto: CreateMentorshipProgramDto) {
    return this.programs.create({
      mentorId,
      status: MentorshipProgramStatus.DRAFT,
      config: {
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        topics: dto.topics ?? [],
        schedule: dto.schedule ?? {},
        price: dto.price ?? 0,
      },
      clonedFromProgramId: null,
    });
  }

  async archive(programId: string, actorId: string) {
    const program = await this.programs.findOne({ _id: programId, mentorId: actorId }).exec();
    if (!program) throw new NotFoundException('Mentorship program not found');
    if (program.status === MentorshipProgramStatus.ARCHIVED) return program;
    if (program.status === MentorshipProgramStatus.DRAFT) {
      throw new ConflictException('Only active mentorship programs can be archived');
    }
    program.status = MentorshipProgramStatus.ARCHIVED;
    program.archivedAt = new Date();
    program.archivedBy = actorId;
    return program.save();
  }

  async clone(programId: string, actorId: string) {
    const source = await this.programs.findOne({ _id: programId, mentorId: actorId }).lean().exec();
    if (!source) throw new NotFoundException('Mentorship program not found');
    const created = await this.programs.create({
      mentorId: actorId,
      status: MentorshipProgramStatus.DRAFT,
      clonedFromProgramId: source._id.toString(),
      config: {
        title: `${source.config.title} (copy)`,
        description: source.config.description,
        topics: [...source.config.topics],
        schedule: { ...source.config.schedule },
        price: source.config.price,
      },
      archivedAt: null,
      archivedBy: null,
    });
    return created;
  }

  async getOwned(programId: string, actorId: string) {
    const program = await this.programs.findOne({ _id: programId, mentorId: actorId }).lean().exec();
    if (!program) throw new NotFoundException('Mentorship program not found');
    return program;
  }
}
