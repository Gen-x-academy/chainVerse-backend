# Shareable Public Scholarship Program Pages

## Summary
Design for publishing accessible, indexable program details with
canonical URLs and structured metadata.

## Design
- `GET /scholarships/programs/:slug` returns only fields explicitly marked
  `published` on the program document — invitation-only or draft programs
  return 404, not a filtered 200.
- Canonical URL and `og:`/JSON-LD structured metadata are generated from
  the same published-fields projection used by the API, so page and API
  can never drift.
- A program revision creates a new `publishedVersion`; the live page swaps
  atomically to the new version rather than partially updating fields.

## Follow-up
Implement the published-fields projection and the public controller under
`src/scholarships/controllers/public-program.controller.ts`.
