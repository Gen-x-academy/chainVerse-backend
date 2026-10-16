# Scholarship User & Operator Documentation

## Summary
Documentation plan covering student applications, sponsor setup,
reviewing, finance operations, privacy, troubleshooting, and incidents.

## Design
- Docs live under `docs/scholarships/` split by audience: `student.md`,
  `sponsor.md`, `reviewer.md`, `finance-ops.md`, `incident-runbook.md`.
- Each doc includes role-specific worked examples using the actual current
  API request/response shapes, not placeholders.
- A `docs-owner` field in each file's frontmatter names who is responsible
  for keeping it current.
- A CI doc-freshness check flags docs untouched for 2+ releases that
  reference an endpoint whose contract changed (see #1213).

## Follow-up
Author the five docs above, then wire the freshness check into the
contract-compatibility CI job.
