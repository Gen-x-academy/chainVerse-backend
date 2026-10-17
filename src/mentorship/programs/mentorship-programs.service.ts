import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import {
  Cohort, CohortAudit, CohortDocument, CohortEnrollment, CohortEnrollmentDocument,
  CohortOffer, CohortOfferDocument, CohortStatus, CohortWaitlistEntry,
  CohortWaitlistEntryDocument, EnrollmentStatus, EligibilityRuleVersion,
  EligibilityVersionDocument, OfferStatus, WaitlistStatus,
} from './schemas/program.schema';
import { CreateCohortDto, CreateEligibilityVersionDto, EligibilityEvaluationDto } from './dto/program.dto';
import { evaluateEligibility } from './eligibility';
import {
  BusinessRuleException, ForbiddenDomainException, ResourceConflictException,
  ResourceNotFoundException, ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const duplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000;
const COHORT_NOT_FOUND = 'Mentorship cohort not found.';
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
    @InjectModel(Cohort.name) private readonly cohorts: Model<CohortDocument>,
    @InjectModel(CohortEnrollment.name) private readonly enrollments: Model<CohortEnrollmentDocument>,
    @InjectModel(CohortWaitlistEntry.name) private readonly waitlist: Model<CohortWaitlistEntryDocument>,
    @InjectModel(CohortOffer.name) private readonly offers: Model<CohortOfferDocument>,
    @InjectModel(EligibilityRuleVersion.name) private readonly eligibility: Model<EligibilityVersionDocument>,
    @InjectModel(CohortAudit.name) private readonly audits: Model<any>,
    private readonly events: EventEmitter2,
  ) {}

  async createCohort(programId: string, actorId: string, dto: CreateCohortDto) {
    const starts = new Date(dto.enrollmentStartsAt);
    const ends = new Date(dto.enrollmentEndsAt);
    if (!(starts < ends)) throw new ValidationDomainException('enrollmentStartsAt must be before enrollmentEndsAt.');
    try {
      return await this.cohorts.create({
        programId, name: dto.name.trim(), capacity: dto.capacity, confirmedCount: 0,
        enrollmentStartsAt: starts, enrollmentEndsAt: ends, coordinatorIds: [...new Set(dto.coordinatorIds)],
        calendar: dto.calendar ?? {}, settings: dto.settings ?? {}, createdBy: actorId,
      });
    } catch (error) {
      if (duplicate(error)) throw new ResourceConflictException('A cohort with this name already exists for the program.');
      throw error;
    }
  }

  async closeCohort(cohortId: string, actorId: string) {
    const cohort = await this.requireCohort(cohortId);
    this.assertCoordinator(cohort, actorId);
    if (cohort.status === CohortStatus.CLOSED) return cohort;
    return this.cohorts.findOneAndUpdate({ _id: cohortId }, { $set: { status: CohortStatus.CLOSED } }, { new: true }).exec();
  }

  async enroll(cohortId: string, participantId: string, actorId: string) {
    const requestedCohort = await this.requireCohort(cohortId);
    if (participantId !== actorId) this.assertCoordinator(requestedCohort, actorId);
    const existing = await this.enrollments.findOne({ cohortId, participantId, status: EnrollmentStatus.CONFIRMED }).exec();
    if (existing) return { status: EnrollmentStatus.CONFIRMED, cohortId, participantId, idempotent: true };
    const cohort = requestedCohort;
    const now = new Date();
    if (cohort.status !== CohortStatus.OPEN || now < cohort.enrollmentStartsAt || now > cohort.enrollmentEndsAt) {
      throw new BusinessRuleException('This cohort is closed or outside its enrollment window.', ErrorCode.BIZ_PROGRAM_NOT_OPEN);
    }
    const seat = await this.cohorts.updateOne(
      { _id: cohortId, status: CohortStatus.OPEN, $expr: { $lt: ['$confirmedCount', '$capacity'] } },
      { $inc: { confirmedCount: 1 } },
    ).exec();
    if (seat.modifiedCount !== 1) return this.joinWaitlist(cohortId, participantId, actorId);
    try {
      await this.enrollments.create({ cohortId, participantId, status: EnrollmentStatus.CONFIRMED, enrolledAt: now, cancelledAt: null });
      this.events.emit('mentorship.cohort.enrolled', { cohortId, participantId });
      return { status: EnrollmentStatus.CONFIRMED, cohortId, participantId, idempotent: false };
    } catch (error) {
      await this.cohorts.updateOne({ _id: cohortId, confirmedCount: { $gt: 0 } }, { $inc: { confirmedCount: -1 } }).exec();
      if (duplicate(error)) return { status: EnrollmentStatus.CONFIRMED, cohortId, participantId, idempotent: true };
      throw error;
    }
  }

  async joinWaitlist(cohortId: string, participantId: string, actorId: string) {
    const cohort = await this.requireCohort(cohortId);
    if (participantId !== actorId) this.assertCoordinator(cohort, actorId);
    if (cohort.status !== CohortStatus.OPEN) throw new BusinessRuleException('Closed cohorts do not accept waitlist entries.', ErrorCode.BIZ_PROGRAM_NOT_OPEN);
    const existing = await this.waitlist.findOne({ cohortId, participantId }).exec();
    if (existing && existing.status === WaitlistStatus.WAITING) return { status: WaitlistStatus.WAITING, position: existing.position, idempotent: true };
    const position = (await this.waitlist.countDocuments({ cohortId, status: WaitlistStatus.WAITING }).exec()) + 1;
    try {
      const entry = await this.waitlist.create({ cohortId, participantId, position, status: WaitlistStatus.WAITING, offeredAt: null, expiresAt: null });
      return { status: entry.status, position: entry.position, idempotent: false };
    } catch (error) {
      if (duplicate(error)) {
        const row = await this.waitlist.findOne({ cohortId, participantId }).exec();
        return { status: row?.status ?? WaitlistStatus.WAITING, position: row?.position ?? position, idempotent: true };
      }
      throw error;
    }
  }

  async confirmOffer(offerId: string, actorId: string) {
    const offer = await this.offers.findOne({ _id: offerId, participantId: actorId }).exec();
    if (!offer) throw new ResourceNotFoundException('Mentorship offer not found.');
    if (offer.status === OfferStatus.CONFIRMED) return offer;
    if (offer.status !== OfferStatus.RESERVED || offer.expiresAt <= new Date()) {
      throw new BusinessRuleException('This mentorship offer is no longer available.', ErrorCode.BIZ_PROGRAM_NOT_OPEN);
    }
    const updated = await this.offers.findOneAndUpdate({ _id: offerId, status: OfferStatus.RESERVED, expiresAt: { $gt: new Date() } }, { $set: { status: OfferStatus.CONFIRMED, confirmedAt: new Date() } }, { new: true }).exec();
    if (!updated) throw new ResourceConflictException('The offer changed while it was being confirmed.');
    await this.waitlist.updateOne({ cohortId: offer.cohortId, participantId: actorId }, { $set: { status: WaitlistStatus.PROMOTED } }).exec();
    await this.enrollments.updateOne({ cohortId: offer.cohortId, participantId: actorId }, { $set: { status: EnrollmentStatus.CONFIRMED, enrolledAt: new Date() } }, { upsert: true }).exec();
    this.events.emit('mentorship.cohort.offer.confirmed', { offerId, cohortId: offer.cohortId, participantId: actorId });
    return updated;
  }

  async transferCoordinator(cohortId: string, actorId: string, coordinatorId: string, reason?: string) {
    const cohort = await this.requireCohort(cohortId);
    this.assertCoordinator(cohort, actorId);
    const updated = await this.cohorts.findOneAndUpdate({ _id: cohortId }, { $addToSet: { coordinatorIds: coordinatorId } }, { new: true }).exec();
    await this.audits.create({ cohortId, action: 'coordinator_transferred', actorId, details: { coordinatorId, reason: reason?.trim() ?? null } });
    return updated;
  }

  async report(cohortId: string, actorId: string) {
    const cohort = await this.requireCohort(cohortId);
    this.assertCoordinator(cohort, actorId);
    const [confirmed, waiting, offered] = await Promise.all([
      this.enrollments.countDocuments({ cohortId, status: EnrollmentStatus.CONFIRMED }).exec(),
      this.waitlist.countDocuments({ cohortId, status: WaitlistStatus.WAITING }).exec(),
      this.offers.countDocuments({ cohortId, status: OfferStatus.RESERVED }).exec(),
    ]);
    return { cohortId, programId: cohort.programId, capacity: cohort.capacity, confirmed, reservedOffers: offered, waiting, status: cohort.status };
  }

  async createEligibilityVersion(programId: string, actorId: string, dto: CreateEligibilityVersionDto) {
    const previous = await this.eligibility.findOne({ programId }).sort({ version: -1 }).exec();
    const version = (previous?.version ?? 0) + 1;
    await this.eligibility.updateMany({ programId }, { $set: { active: false } }).exec();
    return this.eligibility.create({ programId, version, rules: dto.rules, active: true, createdBy: actorId });
  }

  async evaluate(programId: string, dto: EligibilityEvaluationDto) {
    const version = await this.eligibility.findOne({ programId, active: true }).sort({ version: -1 }).lean().exec();
    if (!version) throw new ResourceNotFoundException('No active eligibility rules exist for this program.');
    return { programId, version: version.version, ...evaluateEligibility(version.rules as any, dto) };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireAndPromote() {
    const now = new Date();
    const expired = await this.offers.find({ status: OfferStatus.RESERVED, expiresAt: { $lte: now } }).exec();
    for (const offer of expired) {
      await this.offers.updateOne({ _id: offer._id, status: OfferStatus.RESERVED }, { $set: { status: OfferStatus.EXPIRED } }).exec();
      await this.promoteNext(offer.cohortId.toString());
    }
  }

  private async promoteNext(cohortId: string) {
    const cohort = await this.requireCohort(cohortId);
    const available = cohort.capacity - cohort.confirmedCount - await this.offers.countDocuments({ cohortId, status: OfferStatus.RESERVED }).exec();
    if (available <= 0) return;
    const entry = await this.waitlist.findOneAndUpdate({ cohortId, status: WaitlistStatus.WAITING }, { $set: { status: WaitlistStatus.OFFERED, offeredAt: new Date(), expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } }, { sort: { position: 1 }, new: true }).exec();
    if (!entry) return;
    await this.offers.create({ cohortId, participantId: entry.participantId, status: OfferStatus.RESERVED, expiresAt: entry.expiresAt });
    this.events.emit('mentorship.cohort.offer.created', { cohortId, participantId: entry.participantId });
  }

  private async requireCohort(cohortId: string): Promise<CohortDocument> {
    const cohort = await this.cohorts.findById(cohortId).exec();
    if (!cohort) throw new ResourceNotFoundException(COHORT_NOT_FOUND);
    return cohort;
  }
  private assertCoordinator(cohort: CohortDocument, actorId: string) {
    if (cohort.createdBy !== actorId && !cohort.coordinatorIds.includes(actorId)) {
      throw new ForbiddenDomainException('Only a cohort coordinator may perform this action.', ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
    }
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
