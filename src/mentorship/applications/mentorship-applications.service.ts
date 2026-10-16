import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isValidObjectId, Model } from 'mongoose';
import { createHash } from 'crypto';
import { ErrorCode, ResourceNotFoundException } from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import { MentorshipValidationException } from '../shared/joi-validation.pipe';
import { MentorshipAccessPolicy } from '../shared/mentorship-access.policy';
import { MentorshipAuditService } from '../shared/audit/mentorship-audit.service';
import { MentorshipRequestContext, MentorshipUser } from '../shared/mentorship-context';
import { conflict, MentorshipDomainException, staleVersion } from '../shared/mentorship-errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { MentorshipFormsService } from '../forms/mentorship-forms.service';
import { displayAnswer, evaluateAnswers } from '../forms/domain/answer.evaluator';
import { sortQuestions, stableStringify } from '../forms/domain/form-definition.validator';
import { MentorshipEligibilityService } from '../eligibility/mentorship-eligibility.service';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
  PRIORITY_RANK,
} from './schemas/mentorship-application.schema';
import { SubmitApplicationDto } from './dto/application.dto';

type ApplicationRecord = MentorshipApplication & { _id: unknown };

@Injectable()
export class MentorshipApplicationsService {
  constructor(
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
    private readonly forms: MentorshipFormsService,
    private readonly eligibility: MentorshipEligibilityService,
    private readonly policy: MentorshipAccessPolicy,
    private readonly audit: MentorshipAuditService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Submits an application.
   *
   * Enforcement is identical to preflight (same evaluator, same versions).
   * Idempotent: a retry with the same answers returns the stored application
   * (`created: false`); different answers for an existing application → 409.
   */
  async submit(ctx: MentorshipRequestContext, programId: string, dto: SubmitApplicationDto) {
    const program = await this.policy.loadProgram(programId);
    if (program.status === 'draft' && !this.policy.isAdmin(ctx.user) && !this.policy.isOwner(ctx.user, program)) {
      throw new ResourceNotFoundException('Mentorship program not found', ErrorCode.MENTOR_PROGRAM_NOT_FOUND);
    }

    const existing = await this.applicationModel.findOne({ programId, applicantId: ctx.user.id }).lean().exec();
    if (existing) return this.replayOrConflict(existing, dto);

    const run = await this.eligibility.evaluate(program, ctx.user.id, dto.answers, 'submission');

    if (dto.formVersion !== run.formVersion) {
      this.telemetry.count('mentorship_applications_submitted_total', { result: 'stale_form' });
      throw staleVersion('The application form was updated; reload it and resubmit', {
        currentFormVersion: run.formVersion,
      });
    }
    if (dto.ruleSetVersion !== undefined && dto.ruleSetVersion !== run.ruleSetVersion) {
      this.telemetry.count('mentorship_applications_submitted_total', { result: 'stale_rules' });
      throw staleVersion('Eligibility rules changed since your preflight; run preflight again', {
        currentRuleSetVersion: run.ruleSetVersion,
      });
    }
    if (run.answerEvaluation.issues.length > 0) {
      this.telemetry.count('mentorship_applications_submitted_total', { result: 'invalid_answers' });
      throw new MentorshipValidationException(
        'Some answers are missing or invalid',
        run.answerEvaluation.issues.map(({ field, issue }) => ({ field, issue })),
        ErrorCode.MENTOR_INVALID_ANSWERS,
      );
    }

    await this.eligibility.recordEvaluation('submission', programId, ctx.user.id, run);

    if (run.result.outcome !== 'pass') {
      const failed = run.result.outcome === 'fail';
      this.telemetry.count('mentorship_applications_submitted_total', { result: `eligibility_${run.result.outcome}` });
      throw new MentorshipDomainException(
        failed
          ? 'You do not meet the eligibility requirements for this program'
          : 'More information is needed to check your eligibility',
        HttpStatus.UNPROCESSABLE_ENTITY,
        failed ? ErrorCode.MENTOR_ELIGIBILITY_FAILED : ErrorCode.MENTOR_ELIGIBILITY_NEEDS_INFORMATION,
        { ruleSetVersion: run.ruleSetVersion, checks: run.result.checks.filter((c) => c.outcome !== 'pass') },
      );
    }

    const submittedAt = run.evaluatedAt;
    let created: MentorshipApplicationDocument;
    try {
      created = await this.applicationModel.create({
        programId,
        applicantId: ctx.user.id,
        status: 'submitted',
        formVersion: run.formVersion,
        answers: run.answerEvaluation.answers,
        answersHash: run.inputHash,
        eligibility: { ruleSetVersion: run.ruleSetVersion, outcome: run.result.outcome, evaluatedAt: run.evaluatedAt },
        submittedAt,
        review: {
          assigneeId: null,
          assignedAt: null,
          assignedBy: null,
          priority: 'normal',
          priorityRank: PRIORITY_RANK.normal,
          dueAt: new Date(submittedAt.getTime() + program.reviewSlaDays * 86_400_000),
          overdueNotifiedAt: null,
          clearedReviewerIds: [],
          conflictedReviewerIds: [],
          decision: null,
        },
        version: 0,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.applicationModel.findOne({ programId, applicantId: ctx.user.id }).lean().exec();
        if (winner) return this.replayOrConflict(winner, dto);
      }
      throw err;
    }

    const applicationId = String(created._id);
    await this.audit.record(ctx, {
      action: 'application.submitted',
      programId,
      subjectType: 'application',
      subjectId: applicationId,
      metadata: { formVersion: run.formVersion, ruleSetVersion: run.ruleSetVersion },
      dedupeKey: `application.submitted:${applicationId}`,
    });
    this.telemetry.count('mentorship_applications_submitted_total', { result: 'created' });
    this.events.emit(DomainEvents.MENTORSHIP_APPLICATION_SUBMITTED, {
      applicationId,
      programId,
      applicantId: ctx.user.id,
      dueAt: created.review.dueAt,
    });

    return { ...this.applicantView(created.toObject()), created: true };
  }

  async listMine(ctx: MentorshipRequestContext) {
    const apps = await this.applicationModel
      .find({ applicantId: ctx.user.id })
      .sort({ submittedAt: -1, _id: -1 })
      .limit(100)
      .lean()
      .exec();
    return apps.map((a) => this.applicantView(a));
  }

  /**
   * Renders an application with the exact form version it was submitted
   * against, so historical responses stay readable after the form changes.
   */
  async render(ctx: MentorshipRequestContext, applicationId: string) {
    const app = await this.load(applicationId);
    const audience = await this.audienceFor(ctx.user, app);

    const form = await this.forms.loadVersion(String(app.programId), app.formVersion);
    const responses = sortQuestions(form.questions).map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type,
      answer: app.answers[q.key] ?? null,
      display: displayAnswer(q, app.answers[q.key]),
    }));

    const base = audience === 'applicant' ? this.applicantView(app) : this.staffView(app, ctx.user, audience);
    return { ...base, form: { version: form.version, publishedAt: form.publishedAt }, responses };
  }

  async load(applicationId: string): Promise<ApplicationRecord> {
    const app = isValidObjectId(applicationId)
      ? await this.applicationModel.findById(applicationId).lean().exec()
      : null;
    if (!app) throw new ResourceNotFoundException('Application not found', ErrorCode.MENTOR_APPLICATION_NOT_FOUND);
    return app;
  }

  /** Who is looking: deny unless applicant, admin, owner or a non-conflicted scoped reviewer. */
  private async audienceFor(user: MentorshipUser, app: ApplicationRecord): Promise<'applicant' | 'manager' | 'reviewer'> {
    if (app.applicantId === user.id) return 'applicant';
    const program = await this.policy.loadProgram(String(app.programId));
    if (this.policy.isAdmin(user) || this.policy.isOwner(user, program)) return 'manager';
    const membership = await this.policy.activeMembership(String(app.programId), user.id);
    if (!membership) {
      // Do not reveal that the application exists.
      throw new ResourceNotFoundException('Application not found', ErrorCode.MENTOR_APPLICATION_NOT_FOUND);
    }
    if (app.review.conflictedReviewerIds.includes(user.id)) {
      throw conflict('You declared a conflict of interest for this application', ErrorCode.MENTOR_CONFLICT_OF_INTEREST);
    }
    return membership.role === 'lead' ? 'manager' : 'reviewer';
  }

  private async replayOrConflict(existing: ApplicationRecord, dto: SubmitApplicationDto) {
    if (existing.formVersion === dto.formVersion) {
      const form = await this.forms.loadVersion(String(existing.programId), existing.formVersion);
      const normalised = evaluateAnswers(form.questions, dto.answers).answers;
      const hash = createHash('sha256').update(stableStringify(normalised)).digest('hex');
      if (hash === existing.answersHash) {
        this.telemetry.count('mentorship_applications_submitted_total', { result: 'replayed' });
        return { ...this.applicantView(existing), created: false };
      }
    }
    this.telemetry.count('mentorship_applications_submitted_total', { result: 'duplicate' });
    throw conflict('You have already applied to this program', ErrorCode.MENTOR_ALREADY_APPLIED, {
      applicationId: String(existing._id),
    });
  }

  /** Applicant-safe: no assignee, priority, conflicts or internal notes. */
  applicantView(a: ApplicationRecord) {
    return {
      id: String(a._id),
      programId: String(a.programId),
      status: a.status,
      formVersion: a.formVersion,
      submittedAt: a.submittedAt,
      eligibility: { ruleSetVersion: a.eligibility.ruleSetVersion, outcome: a.eligibility.outcome },
      decision: a.review.decision ? { outcome: a.review.decision.outcome, decidedAt: a.review.decision.decidedAt } : null,
    };
  }

  private staffView(a: ApplicationRecord, viewer: MentorshipUser, audience: 'manager' | 'reviewer') {
    const r = a.review;
    return {
      id: String(a._id),
      programId: String(a.programId),
      applicantId: a.applicantId,
      status: a.status,
      formVersion: a.formVersion,
      submittedAt: a.submittedAt,
      eligibility: a.eligibility,
      version: a.version,
      review: {
        assigneeId: r.assigneeId,
        assignedAt: r.assignedAt,
        priority: r.priority,
        dueAt: r.dueAt,
        overdue: !r.decision && r.dueAt < new Date(),
        decision: r.decision,
        myConflictStatus: r.conflictedReviewerIds.includes(viewer.id)
          ? 'conflicted'
          : r.clearedReviewerIds.includes(viewer.id)
            ? 'cleared'
            : 'undeclared',
        // Who declared what is visible to managers only.
        ...(audience === 'manager' && {
          clearedReviewerIds: r.clearedReviewerIds,
          conflictedReviewerIds: r.conflictedReviewerIds,
        }),
      },
    };
  }
}
