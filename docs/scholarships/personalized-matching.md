# Personalized Scholarship Matching

Closes #1176.

Students previously had no way to find the programs they were actually eligible
for. The catalog existed, but discovery meant browsing every published program
and reading each one. This adds a ranked, **explained** recommendation endpoint
built on two inputs only: what the student chose to verify, and what the student
says they are interested in.

## Design constraint: what may influence an ordering

This is the part that matters most, so it is stated first. Ranking may only use
two families of signal:

1. **Verified eligibility** — facts the student chose to attest to, compared
   against a program's published eligibility rules.
2. **Stated interests** — free-text tags the student typed, matched against the
   program's published title, description and deadlines.

The following are **protected characteristics** and are excluded from ranking
outright: race, ethnicity, colour, national or social origin; religion or belief;
sex, gender, gender identity, sexual orientation; disability and health; age;
family, marital and parental status; military, employment and incarceration
status.

The exclusion is an **allow-list, not a deny-list**. `RankableSignalKind` in
[`src/scholarships/matching/matching-fairness.ts`](../../src/scholarships/matching/matching-fairness.ts)
enumerates the only three signal families that can produce a score. A new
attribute added to a profile schema later is inert until someone deliberately
makes it rankable and documents the legal justification.

A protected characteristic *may* appear in a program's eligibility rules — a
program can legitimately restrict who may apply. But that check is a **pass/fail
gate**, never a ranking weight, so a program's restriction can decide whether
someone may apply but can never reorder anyone else's list.

Legal basis for exclusion: fair-selection norms and, where applicable,
anti-discrimination statutes (the EU AI Act's prohibited-practice list for
selection, Title VII / equal-protection analysis in the US). A future change
that ranks on a protected trait requires documented legal justification, a named
accountable owner, and an explicit opt-in flag. It must not be added to the
allow-list by default.

## Defence in depth

The policy is enforced in four independent places, so no single mistake can leak a
protected trait into an ordering:

| Layer | Mechanism |
| --- | --- |
| Write path | `filterInterests` strips protected traits from a student's tags and **reports** the refused ones so the student is told a tag was ignored. |
| Persistence | `ScholarshipInterestProfileSchema.pre('validate')` rejects the document if an unnormalized or protected tag reaches the database by any path (seed script, admin tool, import). |
| Scoring | `scoreProgram` reads only `interests` and a boolean eligibility verdict. There is no parameter through which a protected attribute could enter. |
| Post-score | `assertNoProtectedSignals` throws if any reason has a non-allow-listed kind, a negative weight, or text referencing a protected trait. |

`assertNoProtectedSignals` is cheap (a handful of string scans) relative to a
database round trip, and it converts a potential discrimination incident into a
loud runtime error instead of a silent ranking.

## API

All routes are student-scoped, taken from the verified JWT `sub`. There is no
`studentId` parameter anywhere on the controller, so one student can neither read
nor mutate another's profile. Sponsors have no route into this controller at all.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `scholarships/matching/recommendations` | Ranked, explained recommendations |
| `GET` | `scholarships/matching/interests` | Current interests and privacy switches (`null` when never set) |
| `PUT` | `scholarships/matching/interests` | Replace stated interests |
| `PATCH` | `scholarships/matching/preferences` | Turn personalized ranking on/off |
| `POST` | `scholarships/matching/dismissals` | Stop recommending a program |
| `GET` | `scholarships/matching/dismissals` | Dismissal history, newest first |

### `GET scholarships/matching/recommendations`

```json
{
  "data": [
    {
      "programId": "…",
      "organizationId": "…",
      "title": "Stellar smart contract scholarship",
      "description": "For students building on the Stellar network.",
      "awardValue": 5000,
      "awardCurrency": "USD",
      "deadline": "2026-12-01",
      "score": 50,
      "coldStart": true,
      "reasons": [
        { "kind": "verified_eligibility", "code": "verified_eligibility",
          "detail": "You meet this program’s verified eligibility requirements", "weight": 25 },
        { "kind": "program_attribute", "code": "open_deadline",
          "detail": "Applications are open until 2026-12-01", "weight": 5 }
      ]
    }
  ],
  "total": 137,
  "page": 1,
  "limit": 10,
  "totalPages": 14,
  "personalization": { "coldStart": true, "optedOut": false, "interestCount": 0, "dismissedCount": 2 }
}
```

Query parameters: `page` (≥1), `limit` (1–50, hard-capped in the service), `sort`
(`relevance` | `award` | `deadline`), `includeApplied` (default `false`).

`sum(reasons[].weight) === score`, so a student can be told exactly why they are
seeing a program, and a reviewer can audit that nothing protected contributed.

### Pipeline

1. Load the interest profile, or fall back to cold start.
2. Load dismissals and remove dismissed programs **and** dismissed sponsors from
   the candidate set *before* scoring, so a dismissal cannot be undone by a
   scoring change or a tie-break.
3. Load published programs that have a published terms revision. `draft`,
   `paused`, `closed` and `archived` programs are never candidates.
4. Exclude programs the student already applied to, unless `includeApplied=true`.
5. Evaluate verified eligibility from the student's own active, unexpired
   attestations against each program's required rules.
6. Score, rank deterministically, page.

## Eligibility: "unverified" is not "ineligible"

A rule whose type has no known mapping, or whose parameters do not carry the
expected key, is reported as **unverified** — never as **failed**.

This distinction is deliberate. "We have not checked" and "you are ineligible"
are very different messages to a student, and conflating them discourages people
from verifying at all. Unverified rules surface in the response as a
**zero-weight** note, so the student learns what to verify without the
unverified fact moving the ordering.

Rule types evaluated today: `ENROLLMENT_STATUS`, `MIN_GPA`,
`COURSE_COMPLETION`. `GEOGRAPHY`, `INCOME_BAND`, `PLATFORM_ROLE`, `MIN_AGE`,
`MAX_AGE` and `CUSTOM_ATTESTATION` all report `unverified` until a verification
flow exists for them; they are also never used as ranking signals.

## Cold start and opt-out

- **Cold start** (no stated interests) — the student still gets a ranked list.
  The score is multiplied by `MATCH_WEIGHTS.coldStart` (0.25), applied to the
  whole score and to every reason weight, so *relative order is preserved* and
  only the confidence in the ordering drops. Cold start is a fallback, not a
  second ranking model. `personalization.coldStart` is returned so the UI can
  prompt the student to set interests rather than presenting generic results as
  tailored ones.
- **Opt-out** (`matchingOptedOut: true`) — the ranker stops reading `interests`
  entirely. The opt-out is honoured **in the ranker**, not only at the service
  call site: the service already passes an empty interest list, but the ranker is
  the component that decides what may influence an ordering, so it must not
  depend on every future caller having filtered correctly. Interests are
  retained so the student can switch matching back on without retyping.

## Determinism

`rankMatches` orders by `score → awardValue → id` (or by the requested field),
and `pageMatches` slices in memory over the already-ordered list. The same
request always returns the same page, which is what makes offset paging safe on
a scored list. The candidate set is hard-capped at `MAX_CANDIDATES` (500)
programs, newest first, so the endpoint's cost is bounded.

## Privacy and data ownership

- The `ScholarshipInterestProfile` document stores **no verified facts**.
  Eligibility is read from the existing `EligibilityAttestation` collection, so
  there is exactly one source of truth per fact.
- `rejectedInterests` keeps the raw text of refused tags solely so the student
  can be told which tag was dropped. It is never read by the ranker and never
  leaves the profile endpoint.
- Dismissal `note` is free text the student typed. It is never surfaced to
  sponsors.
- Nothing in the recommendations response identifies the student to a sponsor.
  This is a student-facing endpoint; sponsors receive nothing from it.
- **Erasure:** deleting the interest profile and the dismissal rows removes every
  interest the student stated. No derived or inferred copy of the interests
  exists anywhere else, so erasure is complete.

## Migration

No migration is required. Two new collections are created lazily by
`MongooseModule.forFeature` and both start empty:

| Collection | Contents |
| --- | --- |
| `scholarship_interest_profiles` | one document per student, unique on `studentId` |
| `scholarship_match_dismissals` | dismissal history, unique on `(studentId, programId)` |

Existing programs, applications and attestations are untouched. Students who
have never set interests get cold-start behaviour immediately, which is the
correct default.

`ScholarshipMatchDismissalSchema` creates indexes on `(studentId, programId)`
(unique) and `(studentId, organizationId)`; both are created by
`autoIndex` at boot like every other schema in the repository.

## Operational impact

- Cost per request is bounded by `MAX_CANDIDATES` and by at most four indexed
  queries (programs, terms, rules, attestations), plus the student's
  applications.
- Ranking happens in application memory because scores are computed from
  normalized tokens; this is why paging is in-memory and why the cap exists.
  If the candidate set needs to grow beyond 500 programs, the ranker should move
  behind a precomputed per-program token index rather than raising the cap.
- `assertNoProtectedSignals` is a fail-closed check: if it ever trips, the
  request errors rather than returning a ranking. It should be treated as a
  **page-worthy alert**, not a transient failure.
- Cold-start flattening means new students see a broadly ranked list; monitor
  the share of requests with `personalization.coldStart: true` as an onboarding
  funnel metric (it should fall as more students set interests).

## Files

| Path | Contents |
| --- | --- |
| `matching-fairness.ts` | the policy: allow-listed signal kinds, protected-trait terms, `filterInterests` |
| `matching-ranker.ts` | pure scoring, deterministic ranking, in-memory paging, `assertNoProtectedSignals` |
| `schemas/matching.schema.ts` | interest profile + dismissal, with the pre-validate guard |
| `dto/matching.dto.ts` | validated request DTOs and the sort enum |
| `services/scholarship-matching.service.ts` | candidate-set rules, eligibility evaluation, recommendation assembly |
| `controllers/scholarship-matching.controller.ts` | student-scoped routes |
| `__tests__/matching-ranker.spec.ts` | fairness and ranking invariants |
| `__tests__/scholarship-matching.service.spec.ts` | candidate-set, ownership and error-contract coverage |
