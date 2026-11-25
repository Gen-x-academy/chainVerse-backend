# MENTOR-083 — Cancellation and refund calculation

Module: `src/mentorship/refunds`. Endpoints under `/mentorship/refunds` (Swagger tag *Mentorship Refunds*).

- **Policy snapshot**: each calculation stores the full policy (`version`, `timeZone`, `tiers`, `lateRefundBps`), so later policy edits never change past results.
- **Time-zone safety**: thresholds are "N hours before start" between UTC instants. DST shifts cannot move a boundary. The IANA zone is used only to describe the boundary for humans.
- **Determinism**: integer minor units, basis points, BigInt floor rounding. `refund + retained == held` always. Exactly on a threshold qualifies for that tier.
- **Rules**: mentor/system cancellation is a full refund. A learner cancelling at or after the start gets `lateRefundBps`. Otherwise the largest matching tier applies.
- **Manual exceptions**: staff request, a *different* staff member approves or rejects. The requester cannot self-approve (403 `REFUND_EXCEPTION_NEEDS_SECOND_APPROVER`). Transfer is blocked while pending.
- **Idempotency**: calculations are unique per `(agreementId, idempotencyKey)`. Same key with different inputs is 409. Transfers use the stable id `refund:<calculationId>`, and a transferred refund is never re-sent.
- **Authorization**: deny-by-default; staff roles only (`admin`, `moderator`, `staff`).
- **Telemetry**: `mentorship_refund_calculated_total{rule}`, `mentorship_refund_exception_total{outcome}`, `mentorship_refund_transfer_total{outcome}`, `mentorship_refund_denied_total{reason}`.
- **Integration**: provide `MENTORSHIP_REFUND_TRANSFER` (`RefundTransferPort`) from the payments integration; without it transfers return 409.
