# Scholarship Security Abuse Case Suite

## Summary
Plan to test object authorization, invitation replay, file attacks,
stored content, webhook forgery, wallet substitution, and payment retries.

## Design
- Each abuse case below gets an automatable test: IDOR against
  application/award IDs, invitation-link replay after acceptance, malicious
  file upload (wrong MIME/oversized/zip-bomb), stored-content injection in
  free-text fields, forged webhook signatures (see #1202), wallet
  substitution mid-payout, and duplicate payment retries.
- High-risk cases run in CI on every PR touching scholarships; lower-risk
  cases live in a documented manual security-suite checklist.
- Every finding gets a tracked remediation issue linked from the test
  case, so a failing case always maps to concrete follow-up work.

## Follow-up
Add the CI-automatable subset under
`test/security/scholarships/` and document the manual checklist.
