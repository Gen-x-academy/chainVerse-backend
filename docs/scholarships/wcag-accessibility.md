# WCAG Compliance Across Scholarship Journeys

## Summary
Plan for making discovery, forms, review rubrics, financial tables, and
status updates usable with assistive technology.

## Design
- Every scholarship form field ships with an associated `<label>`,
  programmatic error association (`aria-describedby`), and a visible focus
  state — checked via automated axe-core scans in CI.
- Financial tables expose row/column headers via proper `<th scope>` markup
  (or the JSON-API equivalent metadata for API-only surfaces) so screen
  readers can announce context.
- Status changes (decision posted, milestone approved) trigger an
  `aria-live` region update on the frontend contract, which this backend
  documents as part of the event payload (see #1178).
- A manual audit checklist covers keyboard-only navigation and
  reduced-motion behavior alongside the automated scan.

## Follow-up
Add the axe-core CI scan for scholarship pages and the manual checklist
under `docs/scholarships/accessibility-checklist.md`.
