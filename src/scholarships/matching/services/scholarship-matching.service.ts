import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
} from '../schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import {
  EligibilityAttestation,
  EligibilityAttestationDocument,
  AttestationStatus,
  AttestationScope,
} from '../schemas/eligibility-attestation.schema';
import { EligibilityRule, EligibilityRuleDocument, EligibilityRuleType, RuleOperator } from '../schemas/eligibility-rule.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipInterestProfile,
  ScholarshipInterestProfileDocument,
  ScholarshipMatchDismissal,
  ScholarshipMatchDismissalDocument,
  MatchDismissalReason,
} from './schemas/matching.schema';
import { filterInterests } from './matching-fairness';
import {
  CandidateProgram,
  EligibilityVerdict,
  ScoredMatch,
  pageMatches,
  rankMatches,
  scoreProgram,
} from './matching-ranker';
import {
  DismissMatchDto,
  MatchSort,
  SetInterestsDto,
  ScholarshipMatchQueryDto,
  UpdateMatchingPreferencesDto,
  MAX_INTERESTS,
} from './dto/matching.dto';
import {
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/** Programs whose lifecycle status allows new applications. */
const MATCHABLE_STATUSES: ScholarshipProgramStatus[] = [
  ScholarshipProgramStatus.PUBLISHED,
];

/** Hard ceiling on the candidate set pulled from Mongo per request. */
const MAX_CANDIDATES = 500;

@Injectable()
export class ScholarshipMatchingService {
  private readonly logger = new Logger(ScholarshipMatchingService.name);

  constructor(
    @InjectModel(ScholarshipProgram.name)
    private readonly programModel: Model<ScholarshipProgramDocument>,
    @InjectModel(ProgramTermsVersion.name)
    private readonly termsModel: Model<ProgramTermsVersionDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(EligibilityAttestation.name)
    private readonly attestationModel: Model<EligibilityAttestationDocument>,
    @InjectModel(EligibilityRule.name)
    private readonly ruleModel: Model<EligibilityRuleDocument>,
    @InjectModel(ScholarshipInterestProfile.name)
    private readonly profileModel: Model<ScholarshipInterestProfileDocument>,
    @InjectModel(ScholarshipMatchDismissal.name)
    private readonly dismissalModel: Model<ScholarshipMatchDismissalDocument>,
  ) {}

  // ── Interest profile ───────────────────────────────────────────────────────

  /**
   * Replaces the student's stated interests, screening protected traits.
   *
   * @returns the normalized interests plus the tags that were refused, so the
   *          API can tell the student exactly which tag was dropped and why
   *          rather than silently ignoring it.
   */
  async setInterests(
    studentId: string,
    dto: SetInterestsDto,
  ): Promise<{ interests: string[]; rejectedInterests: string[] }> {
    const { accepted, rejected } = filterInterests(dto.interests);
    if (accepted.length === 0) {
      throw new ValidationDomainException(
        'None of the supplied interests can be used for matching. Interests must describe subjects, skills or goals — not personal characteristics.',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    if (accepted.length > MAX_INTERESTS) {
      throw new ValidationDomainException(
        `At most ${MAX_INTERESTS} interests may be supplied`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const existing = await this.profileModel.findOne({ studentId }).exec();
    if (existing) {
      existing.interests = accepted;
      existing.rejectedInterests = rejected;
      await existing.save();
      return { interests: accepted, rejectedInterests: rejected };
    }

    try {
      const created = await this.profileModel.create({
        studentId,
        interests: accepted,
        rejectedInterests: rejected,
        matchingOptedOut: false,
      });
      return {
        interests: created.interests,
        rejectedInterests: created.rejectedInterests,
      };
    } catch (err: unknown) {
      // Two concurrent profile writes: the loser re-reads and updates.
      if ((err as { code?: number }).code === 11000) {
        const raced = await this.profileModel.findOne({ studentId }).exec();
        if (raced) {
          raced.interests = accepted;
          raced.rejectedInterests = rejected;
          await raced.save();
          return { interests: accepted, rejectedInterests: rejected };
        }
      }
      throw err;
    }
  }

  /**
   * The student's profile, with the privacy-relevant switches.
   *
   * Returns `null` for a student who has never set interests — that is the
   * cold-start case, not an error, and the caller renders the onboarding
   * prompt instead of a 404.
   */
  async getProfile(studentId: string) {
    const profile = await this.profileModel.findOne({ studentId }).lean().exec();
    if (!profile) return null;
    return {
      interests: profile.interests,
      rejectedInterests: profile.rejectedInterests,
      matchingOptedOut: profile.matchingOptedOut,
      updatedAt: profile.updatedAt ?? null,
    };
  }

  /**
   * Honours an opt-out immediately.
   *
   * Setting `matchingOptedOut: true` stops `recommendations` from reading
   * `interests` at all; the data is retained so the student can switch matching
   * back on without retyping anything.
   */
  async updatePreferences(
    studentId: string,
    dto: UpdateMatchingPreferencesDto,
  ) {
    const existing = await this.profileModel.findOne({ studentId }).exec();
    if (!existing) {
      if (dto.matchingOptedOut === undefined) {
        throw new ResourceNotFoundException(
          'No interest profile to update',
          ErrorCode.RES_NOT_FOUND,
        );
      }
      const created = await this.profileModel.create({
        studentId,
        interests: [],
        rejectedInterests: [],
        matchingOptedOut: dto.matchingOptedOut,
      });
      return { matchingOptedOut: created.matchingOptedOut };
    }
    if (dto.matchingOptedOut !== undefined) {
      existing.matchingOptedOut = dto.matchingOptedOut;
    }
    await existing.save();
    return { matchingOptedOut: existing.matchingOptedOut };
  }

  // ── Dismissal ──────────────────────────────────────────────────────────────

  /**
   * Stops recommending a program.
   *
   * Dismissal is applied as a hard filter before scoring, so a dismissed
   * program cannot reappear because of a scoring change.  Re-dismissing the
   * same program updates the stored reason rather than failing, because a
   * student changing their mind should not be blocked by their own history.
   *
   * @throws ResourceNotFoundException when the program does not exist, so a
   *         caller cannot create dismissal rows for arbitrary ids.
   */
  async dismiss(studentId: string, dto: DismissMatchDto) {
    const program = await this.programModel.findById(dto.programId).lean().exec();
    if (!program) {
      throw new ResourceNotFoundException(
        'Scholarship program not found',
        ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      );
    }

    const existing = await this.dismissalModel
      .findOne({ studentId, programId: program._id })
      .exec();

    if (existing) {
      existing.reason = dto.reason;
      existing.note = dto.note;
      existing.flaggedSignals = dto.flaggedSignals ?? existing.flaggedSignals;
      await existing.save();
      return { programId: String(program._id), dismissed: true, updated: true };
    }

    try {
      await this.dismissalModel.create({
        studentId,
        programId: program._id,
        organizationId: program.organizationId,
        reason: dto.reason,
        note: dto.note,
        flaggedSignals: dto.flaggedSignals ?? [],
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        // Concurrent dismissal of the same program: the other write wins.
        return { programId: String(program._id), dismissed: true, updated: false };
      }
      throw err;
    }
    return { programId: String(program._id), dismissed: true, updated: false };
  }

  /** The student's dismissals, newest first. */
  async listDismissals(studentId: string) {
    return this.dismissalModel
      .find({ studentId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── Recommendations ────────────────────────────────────────────────────────

  /**
   * Ranked, explained, personalized scholarship recommendations (#1176).
   *
   * Pipeline:
   *   1. Load the interest profile (or fall back to cold start).
   *   2. Load dismissals; remove dismissed programs and dismissed sponsors
   *      from the candidate set **before** scoring.
   *   3. Load published programs with a published terms revision.  `draft`,
   *      `paused`, `closed` and `archived` programs are never candidates.
   *   4. Evaluate verified eligibility from the student's active attestations
   *      against each program's rules.
   *   5. Score, rank deterministically, and page.
   *
   * Privacy:
   *   - The only student-side signals are stated interests (already screened for
   *     protected traits) and whether verified eligibility is met.  No protected
   *     characteristic is read, stored, scored or returned.
   *   - Nothing in the response identifies the student to a sponsor; this is a
   *     student-facing endpoint only.
   *
   * Operational:
   *   - The candidate set is capped at {@link MAX_CANDIDATES} and each
   *     recommendation carries its reasons, so a sponsor can always answer
   *     "why did this student see my program?".
   */
  async recommendations(studentId: string, query: ScholarshipMatchQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 50);
    const sort: MatchSort = query.sort ?? MatchSort.RELEVANCE;

    const profile = await this.profileModel.findOne({ studentId }).lean().exec();
    const interests = profile?.matchingOptedOut ? [] : (profile?.interests ?? []);
    const optedOut = profile?.matchingOptedOut === true;

    const dismissals = await this.dismissalModel
      .find({ studentId })
      .lean()
      .exec();
    const dismissedPrograms = new Set(
      dismissals.map((d) => String(d.programId)),
    );
    // A student who dismisses a sponsor does not want that sponsor's whole
    // catalog in their list.
    const dismissedSponsors = new Set(
      dismissals
        .filter((d) => d.reason === MatchDismissalReason.SPONSOR_NOT_WANTED)
        .map((d) => d.organizationId),
    );

    const programs = await this.programModel
      .find({ status: { $in: MATCHABLE_STATUSES } })
      .sort({ createdAt: -1, _id: 1 })
      .limit(MAX_CANDIDATES)
      .lean()
      .exec();

    const visible = programs.filter(
      (p) =>
        !dismissedPrograms.has(String(p._id)) &&
        !dismissedSponsors.has(p.organizationId),
    );

    const termsByProgram = await this.currentTerms(visible);

    // Programs the student already applied to are *excluded* by default rather
    // than merely ranked lower, so the list only contains things they can still
    // act on. The applied set is always computed, because it is also the source
    // of the `not_yet_applied` reason when `includeApplied` is set.
    const appliedProgramIds = await this.appliedProgramIds(studentId);
    const candidates = query.includeApplied
      ? visible
      : visible.filter((p) => !appliedProgramIds.has(String(p._id)));

    const [eligibility, unverifiedRules] = await Promise.all([
      this.evaluateEligibility(studentId, candidates),
      this.rulesFor(candidates),
    ]);

    const scored: ScoredMatch[] = candidates
      .map((program) => {
        const terms = termsByProgram.get(String(program._id));
        const candidate: CandidateProgram = {
          id: String(program._id),
          organizationId: program.organizationId,
          title: program.title,
          description: program.description,
          awardValue: terms?.awardValue ?? 0,
          awardCurrency: terms?.awardCurrency,
          deadline: deadlineOf(terms),
        };
        const verdict: EligibilityVerdict = eligibility.get(String(program._id)) ?? {
          eligible: false,
          unverified: [],
        };
        if (unverifiedRules.has(String(program._id))) {
          verdict.unverified = unverifiedRules.get(String(program._id))!;
        }
        return scoreProgram(
          candidate,
          { interests, optedOut },
          { eligibility: verdict, appliedProgramIds },
        );
      })
      .filter((match) => match.reasons.length > 0);

    const ranked = rankMatches(scored, sort);
    const page1 = pageMatches(ranked, page, limit);

    return {
      ...page1,
      data: page1.data.map((match) => ({
        programId: match.program.id,
        organizationId: match.program.organizationId,
        title: match.program.title,
        description: match.program.description ?? null,
        awardValue: match.program.awardValue,
        awardCurrency: match.program.awardCurrency ?? null,
        deadline: match.program.deadline ?? null,
        score: match.score,
        coldStart: match.coldStart,
        reasons: match.reasons,
      })),
      personalization: {
        /** True when no interest signal was available, so the student is told why the list looks generic. */
        coldStart: optedOut || interests.length === 0,
        optedOut,
        interestCount: interests.length,
        dismissedCount: dismissals.length,
      },
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Currently published terms revision for each program, keyed by program id. */
  private async currentTerms(
    programs: Array<{ _id: Types.ObjectId }>,
  ): Promise<Map<string, ProgramTermsVersionDocument>> {
    if (programs.length === 0) return new Map();
    const ids = programs.map((p) => p._id);
    const terms = await this.termsModel
      .find({ programId: { $in: ids }, status: TermsVersionStatus.PUBLISHED })
      .sort({ versionNumber: -1 })
      .lean()
      .exec();

    const byProgram = new Map<string, ProgramTermsVersionDocument>();
    for (const version of terms) {
      const key = String(version.programId);
      // Sorted newest-first, so the first hit is the current revision.
      if (!byProgram.has(key)) {
        byProgram.set(key, version as ProgramTermsVersionDocument);
      }
    }
    return byProgram;
  }

  private async appliedProgramIds(studentId: string): Promise<Set<string>> {
    const rows = await this.applicationModel
      .find({ applicantId: studentId })
      .select('programId')
      .lean()
      .exec();
    return new Set(rows.map((r) => String(r.programId)));
  }

  /**
   * Program ids whose rules exist but cannot be evaluated from the student's
   * attestations, so the API can tell them what to verify.
   */
  private async rulesFor(
    programs: Array<{ _id: Types.ObjectId }>,
  ): Promise<Map<string, string[]>> {
    if (programs.length === 0) return new Map();
    const rules = await this.ruleModel
      .find({ programId: { $in: programs.map((p) => p._id) }, isRequired: true })
      .lean()
      .exec();
    const byProgram = new Map<string, string[]>();
    for (const rule of rules) {
      const key = String(rule.programId);
      byProgram.set(key, [...(byProgram.get(key) ?? []), rule.ruleType]);
    }
    return byProgram;
  }

  /**
   * Evaluates verified eligibility per program.
   *
   * Only the student's own ACTIVE, unexpired attestations are read, and only
   * the scopes that carry an eligibility claim.  A rule type with no
   * corresponding active attestation is reported as *unverified* — never as
   * *failed* — because "we have not checked" and "you are ineligible" are very
   * different messages to a student, and conflating them would discourage
   * people from verifying.
   */
  private async evaluateEligibility(
    studentId: string,
    programs: Array<{ _id: Types.ObjectId; organizationId: string }>,
  ): Promise<Map<string, EligibilityVerdict>> {
    if (programs.length === 0) return new Map();
    const ids = programs.map((p) => p._id);
    const now = new Date();

    const [attestations, rules] = await Promise.all([
      this.attestationModel
        .find({
          applicantId: studentId,
          programId: { $in: ids },
          status: AttestationStatus.ACTIVE,
          expiresAt: { $gt: now },
        })
        .lean()
        .exec(),
      this.ruleModel
        .find({ programId: { $in: ids }, isRequired: true })
        .lean()
        .exec(),
    ]);

    const attestationsByProgram = new Map<string, EligibilityAttestation[]>();
    for (const att of attestations) {
      const key = String(att.programId);
      attestationsByProgram.set(key, [
        ...(attestationsByProgram.get(key) ?? []),
        att as EligibilityAttestation,
      ]);
    }

    const rulesByProgram = new Map<string, EligibilityRule[]>();
    for (const rule of rules) {
      const key = String(rule.programId);
      rulesByProgram.set(key, [
        ...(rulesByProgram.get(key) ?? []),
        rule as EligibilityRule,
      ]);
    }

    const verdicts = new Map<string, EligibilityVerdict>();
    for (const program of programs) {
      const key = String(program._id);
      const programRules = rulesByProgram.get(key) ?? [];
      const programAttestations = attestationsByProgram.get(key) ?? [];

      if (programRules.length === 0) {
        // No declared requirements: the program is open to anyone.
        verdicts.set(key, { eligible: true, unverified: [] });
        continue;
      }

      const andRules = programRules.filter(
        (r) => r.operator === RuleOperator.AND || r.operator === undefined,
      );
      const orRules = programRules.filter((r) => r.operator === RuleOperator.OR);

      const andResults = andRules.map((rule) =>
        evaluateRule(rule, programAttestations),
      );
      const orResults = orRules.map((rule) =>
        evaluateRule(rule, programAttestations),
      );

      const unverified = [
        ...andResults.filter((r) => r.state === 'unverified').map((r) => r.ruleType),
        // An OR group is satisfied as soon as one member passes, so the
        // unverified members of a passing group are not worth surfacing.
        ...(orResults.some((r) => r.state === 'pass')
          ? []
          : orResults.filter((r) => r.state === 'unverified').map((r) => r.ruleType)),
      ];

      const andSatisfied = andResults.every((r) => r.state === 'pass');
      const orSatisfied = orResults.length === 0 || orResults.some((r) => r.state === 'pass');

      verdicts.set(key, {
        eligible: andSatisfied && orSatisfied,
        unverified: [...new Set(unverified)],
      });
    }
    return verdicts;
  }
}

type RuleEvaluation = {
  ruleType: EligibilityRuleType;
  state: 'pass' | 'fail' | 'unverified';
};

/**
 * Evaluates one eligibility rule against the student's attestations.
 *
 * Deliberately conservative and auditable: a rule whose type has no known
 * mapping, or whose parameters do not carry the expected key, is `unverified`
 * rather than `pass`.  A rule is only ever a *pass/fail gate* — it is never
 * converted into a ranking weight, so a program's restriction on a protected
 * characteristic can gate an application but can never influence an ordering.
 */
function evaluateRule(
  rule: EligibilityRule,
  attestations: EligibilityAttestation[],
): RuleEvaluation {
  const parameters = rule.parameters ?? {};
  const claim = claimFor(rule.ruleType, attestations);

  switch (rule.ruleType) {
    case EligibilityRuleType.ENROLLMENT_STATUS: {
      if (!claim) return { ruleType: rule.ruleType, state: 'unverified' };
      const actual = claim.payload['enrollmentStatus'];
      const required = parameters['status'];
      if (typeof actual !== 'string' || typeof required !== 'string') {
        return { ruleType: rule.ruleType, state: 'unverified' };
      }
      if (required === 'any') return { ruleType: rule.ruleType, state: 'pass' };
      return {
        ruleType: rule.ruleType,
        state: actual === required ? 'pass' : 'fail',
      };
    }
    case EligibilityRuleType.MIN_GPA: {
      if (!claim) return { ruleType: rule.ruleType, state: 'unverified' };
      const actual = claim.payload['gpa'];
      const min = parameters['minGpa'];
      if (typeof actual !== 'number' || typeof min !== 'number') {
        return { ruleType: rule.ruleType, state: 'unverified' };
      }
      return { ruleType: rule.ruleType, state: actual >= min ? 'pass' : 'fail' };
    }
    case EligibilityRuleType.COURSE_COMPLETION: {
      if (!claim) return { ruleType: rule.ruleType, state: 'unverified' };
      const completed = claim.payload['completedCourseIds'];
      if (!Array.isArray(completed)) {
        return { ruleType: rule.ruleType, state: 'unverified' };
      }
      const courseId = parameters['courseId'];
      if (typeof courseId !== 'string') {
        return { ruleType: rule.ruleType, state: 'unverified' };
      }
      return {
        ruleType: rule.ruleType,
        state: completed.map(String).includes(courseId) ? 'pass' : 'fail',
      };
    }
    default:
      // Every other rule type (GEOGRAPHY, INCOME_BAND, PLATFORM_ROLE, MIN_AGE,
      // MAX_AGE, CUSTOM_ATTESTATION) requires a verification flow that is not
      // implemented here. Reporting `unverified` is honest: the student is told
      // there is something to verify instead of being wrongly told they do or do
      // not qualify. These types are also never used as ranking signals.
      return { ruleType: rule.ruleType, state: 'unverified' };
  }
}

function claimFor(
  ruleType: EligibilityRuleType,
  attestations: EligibilityAttestation[],
): EligibilityAttestation | undefined {
  const scope = scopeForRule(ruleType);
  if (!scope) return undefined;
  return attestations.find((a) => a.scope === scope);
}

function scopeForRule(
  ruleType: EligibilityRuleType,
): AttestationScope | undefined {
  switch (ruleType) {
    case EligibilityRuleType.ENROLLMENT_STATUS:
      return AttestationScope.ENROLLMENT;
    case EligibilityRuleType.MIN_GPA:
      return AttestationScope.ENROLLMENT;
    case EligibilityRuleType.COURSE_COMPLETION:
      return AttestationScope.COURSE_COMPLETION;
    case EligibilityRuleType.INCOME_BAND:
      return AttestationScope.INCOME;
    case EligibilityRuleType.GEOGRAPHY:
      return AttestationScope.IDENTITY;
    default:
      return undefined;
  }
}

/** Extracts an ISO date from the opaque `deadlines` map on a terms revision. */
function deadlineOf(terms?: ProgramTermsVersionDocument): string | undefined {
  const deadlines = terms?.deadlines as Record<string, unknown> | undefined;
  if (!deadlines) return undefined;
  for (const key of ['closesAt', 'applicationDeadline', 'dueAt', 'deadline']) {
    const value = deadlines[key];
    if (typeof value === 'string' && value) return value;
    if (value instanceof Date) return value.toISOString();
  }
  return undefined;
}
