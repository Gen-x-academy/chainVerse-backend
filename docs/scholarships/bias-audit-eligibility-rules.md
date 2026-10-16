# Bias Audit for Eligibility & Recommendation Rules

## Summary
Design for reviewing rule and ranking changes for disparate impact and
prohibited proxies before release.

## Design
- Every eligibility/ranking rule version is stored with an `owner`,
  `reviewOutcome`, and `testCohort` used to validate it before release.
- A rule change that touches a protected-proxy-adjacent field (zip code,
  school name, etc.) requires explicit sign-off from a second reviewer
  before it can be marked `approved`.
- Each rule version records a `rollbackTo` pointer to the last known-good
  version for fast reversal.
- High-risk changes (flagged by the proxy-field check) block auto-deploy
  until approval is recorded.

## Follow-up
Implement the rule-version metadata schema and the proxy-field flag check
in the rule-authoring admin flow.
