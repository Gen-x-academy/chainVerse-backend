# Duplicate Identity & Document Abuse Detection

## Summary
Design for flagging likely duplicate applicants, reused documents,
manipulated evidence, and coordinated submissions.

## Design
- Each signal (document hash reuse, device/IP clustering, near-duplicate
  personal details) is scored and logged with the specific evidence that
  triggered it — never a single opaque "fraud score".
- Signals **flag for human review**; nothing is auto-rejected purely on a
  fraud signal.
- Biometric or other sensitive matching data is stored hashed/salted, and
  raw source images are never retained beyond the review window.
- Flagged applicants can appeal; the appeal outcome is recorded against
  the original signal for future tuning.

## Follow-up
Implement `FraudSignalService.evaluate(application)` writing to a
`fraud_signals` collection reviewed via the existing admin review UI.
