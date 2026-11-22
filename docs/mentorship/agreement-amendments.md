# Mentorship Agreement Amendments (MENTOR-048)

## Purpose

Propose versioned changes to an active mentorship agreement — cadence, scope,
dates, price or policies — with a deterministic impact preview and mandatory
re-approval. Old terms keep governing until the amendment is explicitly
activated; rejecting a proposal leaves the agreement untouched.

Cross-repository work item: `MENTOR-048` (backend amendment workflow; paired
with the client work that renders impact previews and approvals).

## Dependencies

- `JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`) and `access-token`.
- `MongooseModule` model `AgreementAmendment`.
- `MetricsModule` + shared `MentorshipTelemetry` for guarded counters.
- Reused stable error codes: `MENTOR_ACCESS_DENIED`, `BIZ_DUPLICATE_REQUEST`,
  `BIZ_MENTORSHIP_TRANSITION_FORBIDDEN`, `BIZ_MENTORSHIP_LIFECYCLE_CONFLICT`,
  `BIZ_MENTORSHIP_OVERRIDE_REQUIRED`, `RES_NOT_FOUND`, `VAL_INVALID_INPUT`.
- Complementary to the agreement-acceptance module: once an amendment becomes
  active, clients should publish a new terms version there so participants
  re-accept it.

## State machine

```
proposed ──approve(all required)──> approved ──activate──> active
    │
    └──reject──> rejected
```

- `proposed`: inert; the superseded version still governs.
- `approved`: every configured approver has signed (append-only approvals).
- `active`: the only state in which the new terms take effect.
- `rejected`: terminal; no change to the underlying agreement.

## Privacy and immutability

- Amendment history is append-only: proposals, approvals, rejections and
  activation timestamps are never rewritten. Corrections are new versions.
- Only intended participants (or admins/moderators) may propose or preview.
- A proposer cannot self-approve unless they are a privileged coordinator.
- Rejection reasons are decision records visible to the parties; no private
  free text from other workflows is copied into amendments.
- Each proposal stores a hash of the terms that would result, so the approved
  content can be verified against what was previewed.

## Idempotency and safety

- Unique index on `{ agreementId, version }`; replaying an identical propose
  returns the original document.
- Approvals are appended with a conditional `findOneAndUpdate` keyed on the
  amendment being `proposed` and the approver not already recorded, so
  concurrent/repeated approvals cannot double-count.
- Rejection and activation each use conditional updates keyed on the expected
  status, preventing races from changing state twice.
- Telemetry counters are emitted on preview, propose, approval, rejection,
  activation, replay and denial, guarded so they cannot break a business path.

## Endpoints

All routes are under `mentorship/agreements/:agreementId/amendments` and require
a bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/preview` | Impact preview (no write) |
| POST | `/` | Propose a versioned amendment |
| GET | `/active` | The amendment currently in force |
| GET | `/` | Immutable amendment history |
| POST | `/:id/approve` | Append an approval |
| POST | `/:id/reject` | Reject a proposal |
| POST | `/:id/activate` | Activate an approved amendment |

## Rollout and rollback

- Rollout: additive module registered in `src/app.module.ts`. Build the
  `{ agreementId, version }` unique index before enabling propose in production.
- Rollback: unregister `AgreementAmendmentModule`. Do not drop the collection —
  it is the audit trail of who proposed, approved or rejected each change.
  Any amendment already `active` remains the governing version; coordinate a
  data decision before reverting activation.
- No other module is edited; existing agreement data is not migrated.
