import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import { MentorshipValidationException } from '../shared/joi-validation.pipe';
import { staleVersion } from '../shared/mentorship-errors';
import { MentorshipAccessPolicy } from '../shared/mentorship-access.policy';
import { MentorshipAuditService } from '../shared/audit/mentorship-audit.service';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
} from '../programs/schemas/mentorship-program.schema';
import {
  ApplicationFormVersion,
  ApplicationFormVersionDocument,
} from './schemas/application-form-version.schema';
import {
  hashQuestions,
  sortQuestions,
  validateFormDefinition,
} from './domain/form-definition.validator';
import { QuestionDefinition } from './domain/question.types';

type FormVersionLike = Pick<
  ApplicationFormVersion,
  'programId' | 'version' | 'status' | 'questions' | 'revision' | 'contentHash' | 'publishedAt'
>;

@Injectable()
export class MentorshipFormsService {
  constructor(
    @InjectModel(ApplicationFormVersion.name)
    private readonly formModel: Model<ApplicationFormVersionDocument>,
    @InjectModel(MentorshipProgram.name)
    private readonly programModel: Model<MentorshipProgramDocument>,
    private readonly policy: MentorshipAccessPolicy,
    private readonly audit: MentorshipAuditService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Opens a draft seeded from the latest published version.
   * Idempotent: if a draft already exists it is returned unchanged.
   */
  async createDraft(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);

    const existing = await this.formModel.findOne({ programId, status: 'draft' }).lean().exec();
    if (existing) return { ...this.toView(existing), created: false };

    const latest = await this.formModel.findOne({ programId }).sort({ version: -1 }).lean().exec();
    const questions = latest?.status === 'published' ? latest.questions : [];

    try {
      const draft = await this.formModel.create({
        programId,
        version: (latest?.version ?? 0) + 1,
        status: 'draft',
        questions,
        revision: 0,
        contentHash: hashQuestions(questions),
        createdBy: ctx.user.id,
      });
      await this.audit.record(ctx, {
        action: 'form.draft_created',
        programId,
        subjectType: 'form_version',
        subjectId: `${programId}:${draft.version}`,
        metadata: { version: draft.version, seededFrom: latest?.version ?? null },
      });
      this.telemetry.count('mentorship_form_actions_total', { action: 'create_draft' });
      return { ...this.toView(draft), created: true };
    } catch (err) {
      // Concurrent create: the partial unique index guarantees a single draft.
      if ((err as { code?: number }).code === 11000) {
        const draft = await this.formModel.findOne({ programId, status: 'draft' }).lean().exec();
        if (draft) return { ...this.toView(draft), created: false };
      }
      throw err;
    }
  }

  async updateDraft(
    ctx: MentorshipRequestContext,
    programId: string,
    version: number,
    questions: QuestionDefinition[],
    expectedRevision: number,
  ) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);
    this.assertValidDefinition(questions);

    const sorted = sortQuestions(questions);
    const contentHash = hashQuestions(sorted);
    const current = await this.loadVersion(programId, version);
    this.assertDraft(current);

    // Retry of an identical edit that already landed: no-op.
    if (current.contentHash === contentHash && current.revision === expectedRevision + 1) {
      return this.toView(current);
    }

    const updated = await this.formModel
      .findOneAndUpdate(
        { programId, version, status: 'draft', revision: expectedRevision },
        { $set: { questions: sorted, contentHash }, $inc: { revision: 1 } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) {
      const latest = await this.loadVersion(programId, version);
      this.assertDraft(latest);
      throw staleVersion(`Draft is at revision ${latest.revision}; reload and re-apply your changes`, {
        currentRevision: latest.revision,
      });
    }

    await this.audit.record(ctx, {
      action: 'form.draft_updated',
      programId,
      subjectType: 'form_version',
      subjectId: `${programId}:${version}`,
      metadata: { version, revision: updated.revision, questionCount: sorted.length },
    });
    this.telemetry.count('mentorship_form_actions_total', { action: 'update_draft' });
    return this.toView(updated);
  }

  /**
   * Publishes a draft, making it immutable and the program's current form.
   * Idempotent: publishing an already-published version returns it.
   */
  async publish(ctx: MentorshipRequestContext, programId: string, version: number, expectedRevision: number) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);

    const current = await this.loadVersion(programId, version);
    if (current.status === 'published') return this.toView(current);

    if (current.questions.length === 0) {
      throw new BusinessRuleException('A form needs at least one question before publishing', ErrorCode.MENTOR_FORM_INVALID_DEFINITION);
    }
    // Defence in depth: re-validate in case validation rules tightened since the draft was saved.
    this.assertValidDefinition(current.questions);

    const now = new Date();
    const published = await this.formModel
      .findOneAndUpdate(
        { programId, version, status: 'draft', revision: expectedRevision },
        { $set: { status: 'published', publishedAt: now, publishedBy: ctx.user.id } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!published) {
      const latest = await this.loadVersion(programId, version);
      if (latest.status === 'published') return this.toView(latest);
      throw staleVersion(`Draft is at revision ${latest.revision}; review the latest draft before publishing`, {
        currentRevision: latest.revision,
      });
    }

    // $max keeps the pointer monotonic even if publishes race.
    await this.programModel.updateOne({ _id: programId }, { $max: { currentFormVersion: version } }).exec();

    await this.audit.record(ctx, {
      action: 'form.published',
      programId,
      subjectType: 'form_version',
      subjectId: `${programId}:${version}`,
      metadata: { version, contentHash: published.contentHash },
      dedupeKey: `form.published:${programId}:${version}`,
    });
    this.telemetry.count('mentorship_form_actions_total', { action: 'publish' });
    this.events.emit(DomainEvents.MENTORSHIP_FORM_PUBLISHED, { programId, version, publishedBy: ctx.user.id });
    return this.toView(published);
  }

  /** Applicant-facing: the form currently accepting submissions. */
  async getCurrentPublished(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    if (program.status !== 'open') await this.policy.assertCanViewProgramInternals(ctx.user, program);
    const form = await this.findCurrentPublished(program);
    return this.toView(form);
  }

  async getVersion(ctx: MentorshipRequestContext, programId: string, version: number) {
    const program = await this.policy.loadProgram(programId);
    await this.policy.assertCanViewProgramInternals(ctx.user, program);
    return this.toView(await this.loadVersion(programId, version));
  }

  async listVersions(ctx: MentorshipRequestContext, programId: string) {
    const program = await this.policy.loadProgram(programId);
    await this.policy.assertCanViewProgramInternals(ctx.user, program);
    const versions = await this.formModel
      .find({ programId }, { questions: 0 })
      .sort({ version: -1 })
      .lean()
      .exec();
    return versions.map((v) => ({
      version: v.version,
      status: v.status,
      revision: v.revision,
      contentHash: v.contentHash,
      publishedAt: v.publishedAt,
      current: v.version === program.currentFormVersion,
    }));
  }

  // ── Helpers shared with applications / eligibility ─────────────────────────

  async findCurrentPublished(program: MentorshipProgram & { _id: unknown }) {
    if (!program.currentFormVersion) {
      throw new BusinessRuleException('This program has no published application form yet', ErrorCode.MENTOR_FORM_NOT_PUBLISHED);
    }
    const form = await this.formModel
      .findOne({ programId: program._id, version: program.currentFormVersion, status: 'published' })
      .lean()
      .exec();
    if (!form) {
      throw new BusinessRuleException('This program has no published application form yet', ErrorCode.MENTOR_FORM_NOT_PUBLISHED);
    }
    return form;
  }

  /** Any version, including retired ones – used to render historical responses. */
  async loadVersion(programId: string, version: number) {
    const form = await this.formModel.findOne({ programId, version }).lean().exec();
    if (!form) throw new ResourceNotFoundException('Form version not found', ErrorCode.MENTOR_FORM_NOT_FOUND);
    return form;
  }

  toView(f: FormVersionLike) {
    return {
      programId: String(f.programId),
      version: f.version,
      status: f.status,
      revision: f.revision,
      contentHash: f.contentHash,
      publishedAt: f.publishedAt,
      questions: sortQuestions(f.questions),
    };
  }

  private assertValidDefinition(questions: QuestionDefinition[]): void {
    const issues = validateFormDefinition(questions);
    if (issues.length === 0) return;
    const unsafe = issues.some((i) => i.unsafe);
    this.telemetry.count('mentorship_form_validation_failures_total', { kind: unsafe ? 'unsafe_markup' : 'definition' });
    throw new MentorshipValidationException(
      unsafe ? 'Form contains unsafe markup' : 'Form definition is invalid',
      issues.map(({ field, issue }) => ({ field, issue })),
      unsafe ? ErrorCode.MENTOR_UNSAFE_MARKUP : ErrorCode.MENTOR_FORM_INVALID_DEFINITION,
    );
  }

  private assertDraft(form: FormVersionLike): void {
    if (form.status !== 'draft') {
      throw new ResourceConflictException(
        `Form version ${form.version} is published and immutable; create a new draft to make changes`,
        ErrorCode.MENTOR_FORM_VERSION_IMMUTABLE,
      );
    }
  }
}
