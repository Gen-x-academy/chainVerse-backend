import {
  MAX_REASONS,
  MATCH_WEIGHTS,
  pageMatches,
  rankMatches,
  scoreProgram,
  type CandidateProgram,
  type ScoredMatch,
} from '../matching-ranker';
import {
  containsProtectedTrait,
  filterInterests,
  normalizeInterest,
  RankableSignalKind,
} from '../matching-fairness';

/**
 * Fairness and ranking guarantees for personalized matching (#1176).
 *
 * These are the tests that encode the policy: a protected characteristic must
 * never influence an ordering. They are deliberately pure-function tests — no
 * database, no Nest — so a regression in the ranking maths is obvious and cheap
 * to catch.
 */

function program(overrides: Partial<CandidateProgram> = {}): CandidateProgram {
  return {
    id: 'program-1',
    organizationId: 'org-1',
    title: 'Stellar smart contract scholarship',
    description: 'For students building on the Stellar network.',
    awardValue: 1000,
    awardCurrency: 'USD',
    deadline: '2026-12-01',
    ...overrides,
  };
}

const eligible = { eligible: true, unverified: [] };
const notEligible = { eligible: false, unverified: [] };
const noApplications = new Set<string>();

describe('protected-trait screening (matching-fairness)', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(normalizeInterest('  Distributed-Systems!  ')).toBe('distributed systems');
    expect(normalizeInterest('Café')).toBe('cafe');
  });

  it('does not drop legitimate interests because of incidental substrings', () => {
    // "age" must not match inside "image" or "storage"; this is why the screen
    // uses word boundaries rather than a plain substring test.
    expect(containsProtectedTrait('image processing')).toBe(false);
    expect(containsProtectedTrait('storage engineering')).toBe(false);
    expect(containsProtectedTrait('page design')).toBe(false);
  });

  it.each([
    ['black'],
    ['asian student'],
    ['muslim'],
    ['disabled'],
    ['nigerian'],
    ['female'],
    ['age 19'],
    ['transgender'],
    ['veteran'],
    ['widow'],
  ])('rejects the protected trait %j', (trait) => {
    expect(containsProtectedTrait(trait)).toBe(true);
  });

  it('reports refused tags instead of silently dropping them', () => {
    const result = filterInterests(['stellar', 'black', 'smart contracts', 'stellar']);

    expect(result.accepted).toEqual(['stellar', 'smart contracts']);
    expect(result.rejected).toEqual(['black']);
    // The student's own words are preserved for the "this tag was refused" UI.
    expect(result.rejected[0]).toBe('black');
  });

  it('de-duplicates case-insensitively', () => {
    expect(filterInterests(['Stellar', 'stellar', 'STELLAR']).accepted).toEqual([
      'stellar',
    ]);
  });

  it('refuses an over-long tag rather than storing unbounded free text', () => {
    const result = filterInterests(['x'.repeat(65)]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('scoreProgram (#1176)', () => {
  it('explains every point of the score', () => {
    const match = scoreProgram(
      program(),
      { interests: ['stellar'], optedOut: false },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );

    const explained = match.reasons.reduce((sum, r) => sum + r.weight, 0);
    expect(explained).toBe(match.score);
  });

  it('scores stated-interest overlap, verified eligibility, deadline and novelty', () => {
    const match = scoreProgram(
      program(),
      { interests: ['stellar'], optedOut: false },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );

    const codes = match.reasons.map((r) => r.code).sort();
    expect(codes).toEqual([
      'interest_overlap',
      'not_yet_applied',
      'open_deadline',
      'verified_eligibility',
    ]);
    expect(match.score).toBe(
      MATCH_WEIGHTS.interestOverlap +
        MATCH_WEIGHTS.verifiedEligibility +
        MATCH_WEIGHTS.openDeadline +
        MATCH_WEIGHTS.notYetApplied,
    );
  });

  it('never emits a negative weight, so nothing is ever "punished"', () => {
    const match = scoreProgram(
      program({ title: 'Unrelated bursary', description: 'General award.' }),
      { interests: ['stellar'], optedOut: false },
      { eligibility: notEligible, appliedProgramIds: new Set(['program-1']) },
    );

    expect(match.score).toBeGreaterThanOrEqual(0);
    for (const reason of match.reasons) expect(reason.weight).toBeGreaterThanOrEqual(0);
  });

  it('only ever uses allow-listed signal kinds', () => {
    const match = scoreProgram(
      program(),
      { interests: ['stellar'], optedOut: false },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );

    const allowed = Object.values(RankableSignalKind);
    for (const reason of match.reasons) expect(allowed).toContain(reason.kind);
  });

  it('refuses to rank a protected trait even if a program description contains one', () => {
    // Defence in depth: even if a sponsor writes "support for black students"
    // into the description, the token must not become matchable.
    const match = scoreProgram(
      program({ description: 'Support for black students in fintech.' }),
      { interests: ['black'], optedOut: false },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );

    expect(match.reasons.some((r) => r.code === 'interest_overlap')).toBe(false);
  });

  it('surfaces unverified eligibility as a non-scoring note', () => {
    const match = scoreProgram(
      program(),
      { interests: [], optedOut: false },
      {
        eligibility: { eligible: false, unverified: ['min_gpa'] },
        appliedProgramIds: new Set(['program-1']),
      },
    );

    const note = match.reasons.find((r) => r.code === 'eligibility_unverified');
    expect(note).toBeDefined();
    // The unverified fact must not move the ordering.
    expect(note!.weight).toBe(0);
  });

  it('does not award the open-deadline bonus when no deadline is published', () => {
    // A stated interest is used so the profile is *not* cold start: cold-start
    // flattening scales the whole score, so the raw weight is not observable in
    // the difference once it has been applied.
    const profile = { interests: ['stellar'], optedOut: false };
    const withDeadline = scoreProgram(program(), profile, {
      eligibility: eligible,
      appliedProgramIds: new Set(['program-1']),
    });
    const withoutDeadline = scoreProgram(program({ deadline: undefined }), profile, {
      eligibility: eligible,
      appliedProgramIds: new Set(['program-1']),
    });

    expect(withDeadline.coldStart).toBe(false);
    expect(withDeadline.score - withoutDeadline.score).toBe(MATCH_WEIGHTS.openDeadline);
  });

  it('caps the number of reasons returned', () => {
    const match = scoreProgram(
      program(),
      {
        interests: ['stellar', 'smart', 'contracts', 'network', 'fintech'],
        optedOut: false,
      },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );
    expect(match.reasons.length).toBeLessThanOrEqual(MAX_REASONS);
  });
});

describe('cold start and opt-out (#1176)', () => {
  it('flags a student with no stated interests as cold start', () => {
    const match = scoreProgram(
      program(),
      { interests: [], optedOut: false },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );
    expect(match.coldStart).toBe(true);
  });

  it('ignores interests entirely when the student opted out', () => {
    const optedOut = scoreProgram(
      program(),
      { interests: ['stellar'], optedOut: true },
      { eligibility: eligible, appliedProgramIds: noApplications },
    );

    // The interest token matches the title, but opting out means the ranker
    // must not read interests — so no interest reason is produced.
    expect(optedOut.reasons.some((r) => r.code === 'interest_overlap')).toBe(false);
    expect(optedOut.coldStart).toBe(true);
  });

  it('flattens scores without disturbing the relative order of programs', () => {
    // Two programs that differ only in whether they publish a deadline, so the
    // only non-personal difference is "open_deadline".
    const withDeadline = program({ id: 'with-deadline' });
    const withoutDeadline = program({ id: 'without-deadline', deadline: undefined });

    const scoreBoth = (optedOut: boolean) =>
      [withDeadline, withoutDeadline].map((p) =>
        scoreProgram(p, { interests: ['stellar'], optedOut }, {
          eligibility: eligible,
          appliedProgramIds: noApplications,
        }),
      );

    const cold = scoreBoth(true);
    const warm = scoreBoth(false);

    // Relative order is preserved: the flattening is a confidence discount, not
    // a re-ranking, so an opt-out user sees the same ordering, less strongly.
    expect(cold[0].score).toBeGreaterThan(cold[1].score);
    expect(warm[0].score).toBeGreaterThan(warm[1].score);
    expect(cold[0].score).toBeLessThan(warm[0].score);
  });
});

describe('rankMatches determinism (#1176)', () => {
  const make = (id: string, score: number, awardValue: number, deadline?: string): ScoredMatch => ({
    program: program({ id, awardValue, deadline }),
    score,
    reasons: [],
    coldStart: false,
  });

  const ranked = [make('c', 10, 100), make('a', 10, 100), make('b', 30, 50)];

  it('orders by score, then award, then id', () => {
    expect(rankMatches(ranked, 'relevance').map((m) => m.program.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('breaks an exact tie deterministically by id', () => {
    expect(rankMatches(ranked, 'relevance').map((m) => m.program.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('returns the same order for the same input regardless of input order', () => {
    const shuffled = [ranked[2], ranked[0], ranked[1]];
    expect(rankMatches(shuffled, 'relevance').map((m) => m.program.id)).toEqual(
      rankMatches(ranked, 'relevance').map((m) => m.program.id),
    );
  });

  it('sorts by award when asked', () => {
    expect(rankMatches(ranked, 'award').map((m) => m.program.awardValue)).toEqual([
      100, 100, 50,
    ]);
  });

  it('sorts programs with no deadline last rather than first', () => {
    const mixed = [make('none', 1, 1, undefined), make('soon', 1, 1, '2026-01-01')];
    expect(rankMatches(mixed, 'deadline').map((m) => m.program.id)).toEqual([
      'soon',
      'none',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [...ranked];
    rankMatches(input, 'award');
    expect(input.map((m) => m.program.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('pageMatches (#1176)', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('reports totals for the whole ranked set, not the page', () => {
    const page = pageMatches(items, 1, 10);
    expect(page).toEqual({
      data: items.slice(0, 10),
      total: 25,
      page: 1,
      limit: 10,
      totalPages: 3,
    });
  });

  it('never duplicates or skips an item across pages', () => {
    const seen: number[] = [];
    for (let p = 1; p <= 3; p++) seen.push(...pageMatches(items, p, 10).data);
    expect(seen).toEqual(items);
  });

  it('returns an empty page past the end without error', () => {
    const page = pageMatches(items, 99, 10);
    expect(page.data).toEqual([]);
    expect(page.total).toBe(25);
  });

  it('reports zero total pages for an empty result set', () => {
    expect(pageMatches([], 1, 10).totalPages).toBe(0);
  });
});
