/**
 * Fairness policy for personalized scholarship matching (#1176).
 *
 * Ranking may only use two families of signal:
 *
 *   1. **Verified eligibility** — the applicant's own attested facts, compared
 *      against a program's published eligibility rules.  These are attributes
 *      the student *chose to verify* in order to be considered for funding.
 *   2. **Stated interests** — free-text tags the student typed in themselves,
 *      matched against the program's published description, title and award
 *      tags.
 *
 * The following are **protected characteristics** and are excluded from
 * ranking entirely.  They may appear in a program's eligibility rules (a
 * program may legitimately restrict who may apply, and that check is a
 * pass/fail gate, not a ranking signal) but they are never turned into a score,
 * never used to boost or suppress a program, and never sent to a sponsor.
 *
 * This is deliberately an allow-list, not a deny-list: a signal that is not
 * named in {@link RANKABLE_SIGNAL_KINDS} cannot contribute to a score, so a
 * new attribute added to the profile schema later is inert until someone
 * deliberately makes it rankable and documents the legal justification.
 *
 * Legal basis for exclusion: fair-hiring / fair-selection norms and, where
 * applicable, anti-discrimination statutes (for example the EU AI Act's
 * prohibited-practice list for employment/selection, and Title VII / equal
 * protection analysis in the US).  **No protected trait is a ranking input
 * under any circumstance in this codebase.**  A future change that ranks on one
 * of these traits requires documented legal justification, a named accountable
 * owner, and an explicit opt-in flag; it must not be added to this list by
 * default.
 */

/** Signal families that may contribute to a match score. */
export enum RankableSignalKind {
  /** Stated-interest overlap between the student's tags and the program. */
  STATED_INTEREST = 'stated_interest',
  /** The student's verified facts satisfy a published eligibility rule. */
  VERIFIED_ELIGIBILITY = 'verified_eligibility',
  /** Non-discriminating program metadata, e.g. award size or open deadline. */
  PROGRAM_ATTRIBUTE = 'program_attribute',
}

/**
 * Protected characteristics.  Membership here is a hard prohibition: the
 * normalizer strips these tags from a student's interests before they are ever
 * compared, and the ranker refuses to score them.
 *
 * Matching is case-insensitive and substring-based on single tokens, so
 * variants ("african american", "african-american", "black") are all covered.
 */
export const PROTECTED_TRAIT_TERMS: readonly string[] = Object.freeze([
  // Race, ethnicity, colour, national or social origin
  'race',
  'racial',
  'ethnic',
  'ethnicity',
  'asian',
  'african',
  'black',
  'hispanic',
  'latino',
  'latina',
  'latinx',
  'arab',
  'middle eastern',
  'caucasian',
  'white',
  'indigenous',
  'native american',
  'pacific islander',
  'nigerian',
  'indian',
  'chinese',
  'japanese',
  'korean',
  'filipino',
  'mexican',
  'national origin',
  'immigrant',
  'refugee',
  'asylee',

  // Religion or belief
  'religion',
  'religious',
  'christian',
  'muslim',
  'islam',
  'jewish',
  'hindu',
  'buddhist',
  'sikh',
  'catholic',
  'evangelical',
  'atheist',
  'faith',

  // Sex, gender, gender identity, sexual orientation
  'sex',
  'gender',
  'female',
  'male',
  'women',
  'woman',
  'men',
  'man',
  'girl',
  'boy',
  'nonbinary',
  'non binary',
  'lgbt',
  'lgbtq',
  'queer',
  'lesbian',
  'gay',
  'bisexual',
  'transgender',
  'trans',

  // Disability and health
  'disabilit',
  'disabled',
  'handicap',
  'autis',
  'depress',
  'anxiety',
  'bipolar',
  'schizophren',
  'epilep',
  'cancer',
  'hiv',
  'blind',
  'deaf',

  // Age
  'age',
  'years old',
  'year old',
  'born in',
  'birth year',
  'elderly',
  'senior citizen',

  // Family or marital status, pregnancy
  'marital',
  'married',
  'single mother',
  'single father',
  'single parent',
  'divorced',
  'widow',
  'pregnan',
  'parent',
  'maternal',
  'paternal',

  // Military, employment and other protected or proxy statuses
  'veteran',
  'military',
  'disabled veteran',
  'unemployed',
  'welfare',
  'recovering addict',
  'ex offender',
  'felon',
  'inmate',
  'genetic',
  'disability',
]);

/**
 * Normalizes one free-text interest into a comparable token.
 *
 * Kept deliberately small: it lowercases, strips punctuation and collapses
 * whitespace.  It does **not** stem, because over-eager stemming collapses
 * distinct interests ("ai" / "aid") and hurts match quality.
 */
export function normalizeInterest(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `token` contains a protected trait.
 *
 * Uses word-boundary matching where possible so that a legitimate interest is
 * not dropped because of an incidental substring.  Two-letter terms such as
 * `age` are the reason for the explicit word-boundary requirement: without it,
 * "image processing" and "storage" would lose "age".
 */
export function containsProtectedTrait(token: string): boolean {
  const value = normalizeInterest(token);
  if (!value) return false;
  // Pad so a boundary match works at the start and end of the string.
  const haystack = ` ${value} `;
  return PROTECTED_TRAIT_TERMS.some((term) => {
    const needle = ` ${term} `;
    return haystack.includes(needle);
  });
}

/**
 * Removes protected traits and de-duplicates an interest list.
 *
 * Rejected tags are *not* silently dropped: {@link InterestFilterResult} reports
 * them so the API can tell the student that a tag was refused and why, instead
 * of leaving them thinking it is being used for ranking.
 */
export interface InterestFilterResult {
  /** Normalized, de-duplicated, protected-trait-free interests. */
  accepted: string[];
  /** Tags dropped because they name a protected characteristic. */
  rejected: string[];
}

export function filterInterests(raw: string[]): InterestFilterResult {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    const token = normalizeInterest(value);
    if (!token) continue;
    if (token.length > 64) {
      rejected.push(value);
      continue;
    }
    if (containsProtectedTrait(token)) {
      rejected.push(value);
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    accepted.push(token);
  }

  return { accepted, rejected };
}
