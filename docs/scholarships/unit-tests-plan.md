# Scholarship Domain Unit Test Plan

## Summary
Test plan covering program, eligibility, application, review, award,
milestone, and finance rules at their boundaries.

## Design
- Table-driven tests per state machine (application status, award status,
  milestone status), enumerating every legal and illegal transition.
- Boundary cases: eligibility exactly at a threshold, zero-amount awards,
  duplicate milestone submission, and expired review windows.
- Every typed error the domain throws gets at least one test asserting it
  is raised for the corresponding invalid input.
- Tests avoid real DB/network calls; domain logic is tested against plain
  in-memory fixtures for determinism and speed.

## Follow-up
Add the fixtures and table-driven suites under
`src/scholarships/__tests__/domain/`.
