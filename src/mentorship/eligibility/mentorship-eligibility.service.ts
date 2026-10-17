import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { ErrorCode, ResourceNotFoundException } from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import { MentorshipValidationException } from '../shared/joi-validation.pipe';
import { MentorshipAccessPolicy } from '../shared/mentorship-access.policy';
import { MentorshipAuditService } from '../shared/audit/mentorship-audit.service';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { staleVersion } from '../shared/mentorship-errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
} from '../programs/schemas/mentorship-program.schema';
import { MentorshipFormsService } from '../forms/mentorship-forms.service';
import { AnswerEvaluation, evaluateAnswers } from '../forms/domain/answer.evaluator';
import { stableStringify } from '../forms/domain/form-definition.validator';
import { ApplicantFactsService } from './applicant-facts.service';
import {
  EligibilityRuleSet,
  EligibilityRuleSetDocument,
} from './schemas/eligibility-rule-set.schema';
import {
  EligibilityEvaluation,
  EligibilityEvaluationDocument,
  PREFLIGHT_RETENTION_DAYS,
} from './schemas/eligibility-evaluation.schema';
import { evaluateEligibility, validateRules } from './domain/eligibility.evaluator';
import { EligibilityResult, EligibilityRule } from './domain/eligibility-rule.types';
import { PreflightDto } from './dto/eligibility.dto';

const SUBMISSION_RETENTION_DAYS = 365;

export interface EligibilityRun {
  result: EligibilityResult;
  ruleSetVersion: number;
  formVersion: number;
  answerEvaluation: AnswerEvaluation;
  inputHash: string;
  evaluatedAt: Date;
}

@Injectable()
export class MentorshipEligibilityService {
  constructor(
    @InjectModel(EligibilityRuleSet.name)
    private readonly ruleSetModel: Model<EligibilityRuleSetDocument>,
    @InjectModel(EligibilityEvaluation.name)
    private readonly evaluationModel: Model<EligibilityEvaluationDocument>,
    @InjectModel(MentorshipProgram.name)
    private readonly programModel: Model<MentorshipProgramDocument>,
    private readonly forms: MentorshipFormsService,
    private readonly facts: ApplicantFactsService,
    private readonly policy: MentorshipAccessPolicy,
    private readonly audit: MentorshipAuditService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly events: EventEmitter2,
  ) {}

  // ── Rule management (owner / admin) ────────────────────────────────────────

  /**
   * Publishes a new immutable rule-set version.
   * Idempotent: identical content to the current version returns it unchanged.
   */
  async publishRules(
    ctx: MentorshipRequestContext,
    programId: string,
    rules: EligibilityRule[],
    expectedCurrentVersion: number,
  ) {
    const program = await this.policy.loadProgram(programId);
    this.policy.assertCanManageProgram(ctx.user, program);

    const { issues, normalised } = validateRules(rules);
    if (issues.length > 0) {
      const unsafe = issues.some((i) => i.unsafe);
      throw new MentorshipValidationException(
        unsafe ? 'Rules contain unsafe markup' : 'Rule definitions are invalid',
        issues.map(({ field, issue }) => ({ field, issue })),
        unsafe ? ErrorCode.MENTOR_UNSAFE_MARKUP : ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const contentHash = createHash('sha256').update(stableStringify(normalised)).digest('hex');
    const current = await this.loadRuleSet(programId, program.currentRuleSetVersion);
    if (current.contentHash === contentHash) return this.ruleSetView(current);

    if (program.currentRuleSetVersion !== expectedCurrentVersion) {
      throw staleVersion('Eligibility rules changed since you loaded them; reload and re-apply', {
        currentRuleSetVersion: program.currentRuleSetVersion,
      });
    }

    const version = program.currentRuleSetVersion + 1;
    let created: EligibilityRuleSetDocument;
    try {
      created = await this.ruleSetModel.create({
        programId,
        version,
        rules: normalised,
        contentHash,
        publishedBy: ctx.user.id,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw staleVersion('Another rule-set version was published concurrently; reload and re-apply', {
          currentRuleSetVersion: version,
        });
      }
      throw err;
    }

    await this.programModel.updateOne({ _id: programId }, { $max: { currentRuleSetVersion: version } }).exec();
    await this.audit.record(ctx, {
      action: 'eligibility.rules_published',
      programId,
      subjectType: 'rule_set',
      subjectId: `${programId}:${version}`,
      metadata: { version, ruleCount: normalised.length },
      dedupeKey: `eligibility.rules_published:${programId}:${version}`,
    });
    this.telemetry.count('mentorship_eligibility_rules_published_total');
    this.events.emit(DomainEvents.MENTORSHIP_RULESET_PUBLISHED, { programId, version });
    return this.ruleSetView(created);
  }

  async getRules(ctx: MentorshipRequestContext, programId: string, version?: number) {
    const program = await this.policy.loadProgram(programId);
    // Rule params may be sensitive: owner/admin only, not reviewers or applicants.
    this.policy.assertCanManageProgram(ctx.user, program);
    return this.ruleSetView(await this.loadRuleSet(programId, version ?? program.currentRuleSetVersion));
  }

  // ── Evaluation (shared by preflight and submission) ────────────────────────

  /**
   * The single evaluation path used by both preflight and submission so the
   * two can never disagree for the same (rule-set version, form version, input).
   */
  async evaluate(
    program: MentorshipProgramDocument,
    applicantId: string,
    rawAnswers: Record<string, unknown>,
    mode: 'preflight' | 'submission',
  ): Promise<EligibilityRun> {
    const form = await this.forms.findCurrentPublished(program);
    const ruleSet = await this.loadRuleSet(String(program._id), program.currentRuleSetVersion);

    const answerEvaluation = evaluateAnswers(form.questions, rawAnswers, { partial: mode === 'preflight' });
    const facts = await this.facts.collect(
      applicantId,
      program,
      answerEvaluation.answers,
      form.questions.map((q) => q.key),
    );
    const result = evaluateEligibility(ruleSet.rules, facts);

    return {
      result,
      ruleSetVersion: ruleSet.version,
      formVersion: form.version,
      answerEvaluation,
      inputHash: createHash('sha256').update(stableStringify(answerEvaluation.answers)).digest('hex'),
      evaluatedAt: facts.now,
    };
  }

  async preflight(ctx: MentorshipRequestContext, programId: string, dto: PreflightDto) {
    const program = await this.policy.loadProgram(programId);
    if (program.status === 'draft') {
      // Drafts are invisible to applicants; staff may dry-run them.
      await this.policy.assertCanViewProgramInternals(ctx.user, program).catch(() => {
        throw new ResourceNotFoundException('Mentorship program not found', ErrorCode.MENTOR_PROGRAM_NOT_FOUND);
      });
    }

    const run = await this.evaluate(program, ctx.user.id, dto.answers, 'preflight');
    const { answerEvaluation } = run;

    // Type/format problems are reported as validation errors; unknown keys are
    // treated as stale input (the form changed) rather than as an error.
    const typeIssues = answerEvaluation.issues.filter((i) => i.code !== 'unknown_question');
    if (typeIssues.length > 0) {
      this.telemetry.count('mentorship_preflight_total', { outcome: 'invalid_answers' });
      throw new MentorshipValidationException(
        'Some answers are invalid',
        typeIssues.map(({ field, issue }) => ({ field, issue })),
        ErrorCode.MENTOR_INVALID_ANSWERS,
      );
    }

    const staleInputs: string[] = [];
    if (dto.formVersion !== undefined && dto.formVersion !== run.formVersion) staleInputs.push('formVersion');
    if (dto.ruleSetVersion !== undefined && dto.ruleSetVersion !== run.ruleSetVersion) staleInputs.push('ruleSetVersion');
    if (answerEvaluation.unknownKeys.length > 0) staleInputs.push('answers');

    await this.recordEvaluation('preflight', programId, ctx.user.id, run);
    this.telemetry.count('mentorship_preflight_total', { outcome: run.result.outcome });
    if (staleInputs.length > 0) this.telemetry.count('mentorship_preflight_stale_inputs_total');

    return {
      outcome: run.result.outcome,
      checks: run.result.checks,
      evaluatedRuleSetVersion: run.ruleSetVersion,
      formVersion: run.formVersion,
      evaluatedAt: run.evaluatedAt,
      staleInputs,
      ignoredAnswerKeys: [...answerEvaluation.unknownKeys, ...answerEvaluation.hiddenKeysDropped],
      missingRequiredQuestions: answerEvaluation.missingRequired,
    };
  }

  /** Upsert keyed on the input fingerprint so retries never add rows. */
  async recordEvaluation(
    kind: 'preflight' | 'submission',
    programId: string,
    applicantId: string,
    run: EligibilityRun,
  ): Promise<void> {
    const retentionDays = kind === 'preflight' ? PREFLIGHT_RETENTION_DAYS : SUBMISSION_RETENTION_DAYS;
    try {
      await this.evaluationModel
        .updateOne(
          {
            applicantId,
            programId,
            kind,
            ruleSetVersion: run.ruleSetVersion,
            formVersion: run.formVersion,
            inputHash: run.inputHash,
          },
          {
            $set: {
              outcome: run.result.outcome,
              checks: run.result.checks.map((c) => ({ ruleId: c.ruleId, outcome: c.outcome })),
              lastEvaluatedAt: run.evaluatedAt,
              expiresAt: new Date(run.evaluatedAt.getTime() + retentionDays * 86_400_000),
            },
            $inc: { count: 1 },
          },
          { upsert: true },
        )
        .exec();
    } catch (err) {
      // Concurrent identical upserts can race on the unique index; one row wins, which is the goal.
      if ((err as { code?: number }).code !== 11000) {
        this.telemetry.warn('mentorship.eligibility.record_failed', { programId, error: (err as Error).message });
      }
    }
  }

  private async loadRuleSet(programId: string, version: number) {
    if (version === 0) {
      return { programId, version: 0, rules: [] as EligibilityRule[], contentHash: createHash('sha256').update('[]').digest('hex'), createdAt: undefined };
    }
    const ruleSet = await this.ruleSetModel.findOne({ programId, version }).lean().exec();
    if (!ruleSet) throw new ResourceNotFoundException('Eligibility rule set not found', ErrorCode.MENTOR_RULESET_NOT_FOUND);
    return ruleSet;
  }

  private ruleSetView(r: Pick<EligibilityRuleSet, 'programId' | 'version' | 'rules' | 'contentHash' | 'createdAt'>) {
    return {
      programId: String(r.programId),
      version: r.version,
      contentHash: r.contentHash,
      publishedAt: r.createdAt ?? null,
      rules: r.rules,
    };
  }
}
