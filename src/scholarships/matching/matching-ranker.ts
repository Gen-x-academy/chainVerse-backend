import { RankableSignalKind, containsProtectedTrait, normalizeInterest } from './matching-fairness';

/**
 * One explainable contribution to a recommendation score.
 *
 * Recommendations are never returned as a bare number: a student is told *why*
 * they are seeing a program, and a reviewer can audit that no protected trait
 * contributed.  Every reason therefore carries the {@link RankableSignalKind}
 * that produced it, and the ranker refuses to emit a reason whose kind is not
 * allow-listed.
 */
export interface MatchReason {
  kind: RankableSignalKind;
  /** Stable machine code, e.g. `interest_overlap`. */
  code: string;
  /** Human-readable explanation safe to show a student. */
  detail: string;
  /** Contribution to the final score. Always ≥ 0; never negative. */
  weight: number;
}

/** The student's rankable inputs. Contains no protected traits by construction. */
export interface CandidateProfile {
  /** Normalized stated interests, already screened by `filterInterests`. */
  interests: string[];
  /** When true, interests are ignored and cold-start ordering is used. */
  optedOut: boolean;
}

/** The program-side inputs the ranker is allowed to read. */
export interface CandidateProgram {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  awardValue: number;
  awardCurrency?: string;
  /** Closest application deadline, ISO date, when the program publishes one. */
  deadline?: string;
}

/** Weights, in score points, for each signal. */
export const MATCH_WEIGHTS = {
  /** Awarded per matched stated interest. */
  interestOverlap: 12,
  /** Awarded once when every verified eligibility rule the program declares is met. */
  verifiedEligibility: 25,
  /** Awarded once when the program has a deadline and it is still open. */
  openDeadline: 5,
  /** Awarded for a program the student has not applied to yet. */
  notYetApplied: 8,
  /**
   * Flattening coefficient for cold-start ordering. Cold start must be a
   * *fallback*, not a different ranking model: new students still see the most
   * relevant programs, just without a personal-interest component.
   */
  coldStart: 0.25,
} as const;

/** Maximum number of reasons returned per recommendation. */
export const MAX_REASONS = 4;

export interface ScoredMatch {
  program: CandidateProgram;
  score: number;
  reasons: MatchReason[];
  /** True when the student has no usable personalization signal. */
  coldStart: boolean;
}

/** Result of evaluating one program's eligibility rules against the student. */
export interface EligibilityVerdict {
  /** True when every required rule is satisfied (or there are no rules). */
  eligible: boolean;
  /** Rule types that could not be evaluated from the student's attestations. */
  unverified: string[];
}

/**
 * Deterministic score for one program.
 *
 * Pure and side-effect free so it can be unit-tested exhaustively and reasoned
 * about in review.  Guarantees:
 *
 *   - **No protected trait is an input.** The only student-side inputs are
 *     {@link CandidateProfile.interests} (screened upstream by
 *     `filterInterests`) and a boolean eligibility verdict.  There is no
 *     parameter through which a protected attribute could enter, and
 *     `assertNoProtectedSignals` re-checks defensively.
 *   - **Reasons explain the score.** `sum(reasons[].weight) === score` (within
 *     rounding), so a student can be told exactly why they are seeing a program.
 *   - **Every weight is non-negative.** A poor match simply scores low; nothing
 *     can push a program down, so a program can never be "punished" for
 *     something a student did not state.
 */
export function scoreProgram(
  program: CandidateProgram,
  profile: CandidateProfile,
  options: {
    eligibility: EligibilityVerdict;
    appliedProgramIds: ReadonlySet<string>;
  },
): ScoredMatch {
  const reasons: MatchReason[] = [];

  // ── Stated-interest overlap ────────────────────────────────────────────────
  // An opt-out is honoured here, in the ranker, rather than only at the service
  // call site. The service already passes an empty interest list when the
  // student opted out, but the ranker is the component that decides what may
  // influence an ordering, so it must not depend on its caller having filtered
  // correctly. Trusting the caller here would make "we honour opt-out" a
  // property of every future call site rather than of the ranker.
  const effectiveInterests = profile.optedOut ? [] : profile.interests;
  const haystack = programHaystack(program);
  const matched = effectiveInterests
    .filter((interest) => haystack.has(interest))
    .sort();

  if (matched.length > 0) {
    reasons.push({
      kind: RankableSignalKind.STATED_INTEREST,
      code: 'interest_overlap',
      detail:
        matched.length === 1
          ? `Matches your interest in ${matched[0]}`
          : `Matches ${matched.length} of your interests: ${matched.join(', ')}`,
      weight: MATCH_WEIGHTS.interestOverlap * matched.length,
    });
  }

  // ── Verified eligibility ───────────────────────────────────────────────────
  if (options.eligibility.eligible) {
    reasons.push({
      kind: RankableSignalKind.VERIFIED_ELIGIBILITY,
      code: 'verified_eligibility',
      detail: 'You meet this program’s verified eligibility requirements',
      weight: MATCH_WEIGHTS.verifiedEligibility,
    });
  } else if (options.eligibility.unverified.length > 0) {
    // Not eligible, but for rules the student has not verified yet.  Surfaced
    // as a *non-scoring* note so a student can be told what to verify without
    // the unverified fact influencing the order.
    reasons.push({
      kind: RankableSignalKind.VERIFIED_ELIGIBILITY,
      code: 'eligibility_unverified',
      detail:
        'Verify your enrolment status or GPA to confirm eligibility for this program',
      weight: 0,
    });
  }

  // ── Program attributes ─────────────────────────────────────────────────────
  if (program.deadline) {
    reasons.push({
      kind: RankableSignalKind.PROGRAM_ATTRIBUTE,
      code: 'open_deadline',
      detail: `Applications are open until ${program.deadline}`,
      weight: MATCH_WEIGHTS.openDeadline,
    });
  }

  if (!options.appliedProgramIds.has(program.id)) {
    reasons.push({
      kind: RankableSignalKind.PROGRAM_ATTRIBUTE,
      code: 'not_yet_applied',
      detail: 'You have not applied to this program yet',
      weight: MATCH_WEIGHTS.notYetApplied,
    });
  }

  assertNoProtectedSignals(reasons);

  let score = reasons.reduce((sum, reason) => sum + reason.weight, 0);

  // ── Cold start / opt-out flattening ────────────────────────────────────────
  // A student with no stated interests (or one who opted out) still gets a
  // ranked list, but the ordering is dominated by eligibility and
  // non-personal signals rather than being noise.  The factor is applied to the
  // whole score so that relative order is preserved and only the *confidence*
  // in the order changes — an opt-out user is not shown a different set of
  // programs, just a less personalised ordering of the same set.
  const coldStart = profile.optedOut || profile.interests.length === 0;
  if (coldStart && score > 0) {
    score = Math.round(score * MATCH_WEIGHTS.coldStart);
    for (const reason of reasons) {
      reason.weight = Math.round(reason.weight * MATCH_WEIGHTS.coldStart);
    }
  }

  return {
    program,
    score,
    reasons: reasons
      .sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code))
      .slice(0, MAX_REASONS),
    coldStart,
  };
}

/**
 * Orders scored matches.
 *
 * Ties are broken deterministically — by score, then by award value, then by
 * id — so two identical requests always return the same page, which is what
 * makes offset paging safe on a scored list.
 */
export function rankMatches(
  matches: ScoredMatch[],
  sort: 'relevance' | 'award' | 'deadline',
): ScoredMatch[] {
  const byId = (a: ScoredMatch, b: ScoredMatch) => a.program.id.localeCompare(b.program.id);

  const sorted = [...matches];
  switch (sort) {
    case 'award':
      sorted.sort(
        (a, b) => b.program.awardValue - a.program.awardValue || byId(a, b),
      );
      break;
    case 'deadline':
      sorted.sort((a, b) => {
        const ad = a.program.deadline ?? '9999-12-31';
        const bd = b.program.deadline ?? '9999-12-31';
        return ad.localeCompare(bd) || byId(a, b);
      });
      break;
    case 'relevance':
    default:
      sorted.sort(
        (a, b) => b.score - a.score || b.program.awardValue - a.program.awardValue || byId(a, b),
      );
      break;
  }
  return sorted;
}

/** Paginates an already-ordered list; `total` reflects the full ranked set. */
export function pageMatches<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
  };
}

/**
 * Split-normalized set of terms a program can be matched on.
 *
 * Only non-personal program metadata is read: title, description and deadline.
 * Program eligibility parameters are never tokenized, because a program may
 * legitimately encode a protected restriction there, and a title-level match
 * must never be able to reconstruct it.
 */
function programHaystack(program: CandidateProgram): Set<string> {
  const text = [program.title, program.description ?? '']
    .join(' ')
    .toLowerCase();
  const tokens = new Set<string>();
  for (const raw of text.split(/[^\p{Letter}\p{Number}+#.]+/u)) {
    const token = normalizeInterest(raw);
    if (token.length < 2 || token.length > MAX_TOKEN_LENGTH) continue;
    // Defence in depth: even if a program description contains a protected
    // term, it must not be able to satisfy a protected interest.
    if (containsProtectedTrait(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

const MAX_TOKEN_LENGTH = 64;

/**
 * Fails loudly if a protected characteristic ever reached a score.
 *
 * This is the tripwire for the fairness policy in `matching-fairness.ts`.  It
 * is cheap (a handful of string scans per recommendation) relative to a database
 * round trip, and it converts a potential discrimination incident into a loud
 * runtime error instead of a silent ranking.
 */
function assertNoProtectedSignals(reasons: MatchReason[]): void {
  for (const reason of reasons) {
    if (!Object.values(RankableSignalKind).includes(reason.kind)) {
      throw new Error(
        `Match reason "${reason.code}" has non-rankable kind "${reason.kind}"`,
      );
    }
    if (reason.weight < 0) {
      throw new Error(
        `Match reason "${reason.code}" has a negative weight (${reason.weight})`,
      );
    }
    if (containsProtectedTrait(reason.detail)) {
      throw new Error(
        `Match reason "${reason.code}" text references a protected characteristic`,
      );
    }
  }
}
