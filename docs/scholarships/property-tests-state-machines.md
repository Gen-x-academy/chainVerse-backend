# Property Tests for Scholarship State Machines

## Summary
Design for generating application, decision, award, milestone, and
payment action sequences to verify invariants hold.

## Design
- A property-test generator produces random sequences of valid and
  invalid actions against each state machine (application, award,
  milestone, payment).
- Every generated seed is logged so a failing case is reproducible by
  re-running with the same seed.
- The core invariant checked after every sequence: an illegal transition
  never mutates state, and total budget/payment amounts are conserved
  (nothing created or destroyed by a rejected action).
- Shrinking is enabled so failures reduce to the smallest failing
  sequence.

## Follow-up
Implement the generators using the project's existing test framework's
property-testing plugin (or `fast-check` if none is present yet).
