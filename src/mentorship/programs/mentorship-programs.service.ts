import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ValidationDomainException } from '../../common/errors';
import { assertSafeText } from '../shared/safe-text';
import { MentorshipAccessPolicy } from '../shared/mentorship-access.policy';
import { MentorshipAuditService } from '../shared/audit/mentorship-audit.service';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
} from './schemas/mentorship-program.schema';
import {
  ProgramReviewer,
  ProgramReviewerDocument,
} from './schemas/program-reviewer.schema';
import { CreateProgramDto, UpdateProgramDto, UpsertReviewerDto } from './dto/program.dto';

@Injectable()
export class MentorshipProgramsService {
  constructor(
    @InjectModel(MentorshipProgram.name)
    private readonly programModel: Model<MentorshipProgramDocument>,
    @InjectModel(ProgramReviewer.name)
    private readonly reviewerModel: Model<ProgramReviewerDocument>,
    private readonly policy: MentorshipAccessPolicy,
    private readonly audit: MentorshipAuditService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly config: ConfigService,
  ) {}

  async create(ctx: MentorshipRequestContext, dto: CreateProgramDto) {
    assertSafeText([
      { field: 'title', value: dto.title },
      { field: 'description', value: dto.description },
    ]);

    const program = await this.programModel.create({
      ...dto,
      reviewSlaDays: dto.reviewSlaDays ?? this.config.get<number>('mentorship.defaultReviewSlaDays') ?? 7,
      ownerId: ctx.user.id,
      status: 'draft',
    });

    await this.audit.record(ctx, {
      action: 'program.created',
      programId: String(program._id),
      subjectType: 'program',
      subjectId: String(program._id),
    });
    this.telemetry.count('mentorship_program_actions_total', { action: 'create' });
    return this.toView(program);
  }

  async get(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    // Open programs are discoverable by any authenticated user; drafts and
    // closed programs only by people who run them.
    if (program.status !== 'open') {
      await this.policy.assertCanViewProgramInternals(ctx.user, program);
    }
    return this.toView(program);
  }

  async update(ctx: MentorshipRequestContext, programId: string, dto: UpdateProgramDto) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);
    assertSafeText([
      { field: 'title', value: dto.title },
      { field: 'description', value: dto.description },
    ]);

    const opens = dto.applicationOpensAt !== undefined ? dto.applicationOpensAt : program.applicationOpensAt;
    const closes = dto.applicationClosesAt !== undefined ? dto.applicationClosesAt : program.applicationClosesAt;
    if (opens && closes && opens >= closes) {
      throw new ValidationDomainException('applicationClosesAt must be after applicationOpensAt');
    }

    program.set(dto);
    await program.save();

    await this.audit.record(ctx, {
      action: 'program.updated',
      programId,
      subjectType: 'program',
      subjectId: programId,
      metadata: { fields: Object.keys(dto) },
    });
    return this.toView(program);
  }

  async listReviewers(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    if (!(await this.policy.canLeadQueue(ctx.user, program))) this.policy.deny('list_reviewers');
    const reviewers = await this.reviewerModel.find({ programId }).sort({ reviewerId: 1 }).lean().exec();
    return reviewers.map((r) => this.reviewerView(r));
  }

  /** Idempotent: PUT with the same body yields the same membership. */
  async upsertReviewer(
    ctx: MentorshipRequestContext,
    programId: string,
    reviewerId: string,
    dto: UpsertReviewerDto,
  ) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);

    const membership = await this.reviewerModel
      .findOneAndUpdate(
        { programId, reviewerId },
        {
          $set: { role: dto.role, capacity: dto.capacity, active: dto.active },
          $setOnInsert: { programId, reviewerId, activeAssignments: 0 },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();

    await this.audit.record(ctx, {
      action: 'reviewer.upserted',
      programId,
      subjectType: 'reviewer',
      subjectId: reviewerId,
      metadata: { role: dto.role, capacity: dto.capacity, active: dto.active },
    });
    this.telemetry.count('mentorship_program_actions_total', { action: 'upsert_reviewer' });
    return this.reviewerView(membership!);
  }

  toView(p: MentorshipProgramDocument | (MentorshipProgram & { _id: unknown })) {
    return {
      id: String(p._id),
      title: p.title,
      description: p.description,
      ownerId: p.ownerId,
      status: p.status,
      applicationOpensAt: p.applicationOpensAt,
      applicationClosesAt: p.applicationClosesAt,
      reviewSlaDays: p.reviewSlaDays,
      currentFormVersion: p.currentFormVersion,
      currentRuleSetVersion: p.currentRuleSetVersion,
    };
  }

  private reviewerView(r: ProgramReviewer) {
    return {
      programId: String(r.programId),
      reviewerId: r.reviewerId,
      role: r.role,
      capacity: r.capacity,
      activeAssignments: r.activeAssignments,
      active: r.active,
    };
  }
}
