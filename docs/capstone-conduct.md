# Capstone Code of Conduct (CAPSTONE-055)

Enforces a versioned code of conduct across capstone and research projects: policy publication,
per-user acknowledgement and re-acknowledgement, a compliance hook for other modules, and restricted
breach references. Additive, in-memory and tenant-keyed (same model as `project-milestones`); it needs
no migration. Routes live under `/api/v1/capstone-conduct/tenants/{tenantId}`.

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/policies` | admin, moderator | Publish a new policy version (supersedes the current one) |
| GET | `/policies` | admin, moderator | List all versions |
| GET | `/policies/current?track=` | any member | Current policy for a track |
| POST | `/acknowledgements` | caller (self only) | Acknowledge the current version |
| GET | `/status?track=&userId?` | caller; `userId` needs admin | Acknowledgement standing |
| POST | `/breaches` | admin, moderator | Record a breach reference |
| GET | `/breaches`, `/breaches/{id}` | admin, moderator | Read breach references |
| POST | `/breaches/{id}/transitions` | admin, moderator | Move through the breach lifecycle |
| GET | `/audit` | admin, moderator | Audit metadata |

Every mutation requires an `idempotencyKey` (`^[A-Za-z0-9._-]{8,128}$`). Swagger documents all DTOs
and error responses at `/api/docs`.

## Rules

- **Applicability:** a policy lists the tracks it covers (`capstone`, `research`). Acknowledging a
  track the policy does not cover returns `BIZ_CONDUCT_POLICY_NOT_APPLICABLE`.
- **Staleness:** only the current version can be acknowledged. Any other version returns
  `BIZ_CONDUCT_POLICY_STALE` with `details.currentVersion`.
- **Re-acknowledgement:** a new version defaults to `requiresReacknowledgement: true`. A user whose
  latest acknowledgement predates any such version has standing `reacknowledgement_required`. A
  version published with `false` carries existing acknowledgements forward.
- **Standing:** `not_acknowledged`, `current`, `reacknowledgement_required`. `compliant` is true only
  for `current`, or when no policy applies to the track.
- **Enforcement hook:** other capstone modules import `CapstoneConductModule` and call
  `CapstoneConductService.assertCompliant(tenantId, userId, track)`, which throws
  `BIZ_CONDUCT_ACK_REQUIRED` (422) when the user must acknowledge first.
- **Breach lifecycle:** `recorded → under_review | dismissed`, `under_review → upheld | dismissed`.
  `upheld` and `dismissed` are terminal; anything else returns
  `BIZ_CONDUCT_BREACH_INVALID_TRANSITION`. One reference per `caseReference` per tenant
  (`RES_ALREADY_EXISTS`).

## Concurrency and idempotency

State-changing work is serialised per tenant, so check-then-write sequences are atomic. Retries with
the same key and payload replay the stored response; the same key with a different payload returns
`BIZ_IDEMPOTENCY_KEY_REUSED` (409). Acknowledgement ids are deterministic
(`userId:track:version`), so duplicates are impossible even across different keys. The
re-acknowledgement notification fires once per publish; a retry replays the response without
re-notifying.

## Privacy boundaries

- Policy text is never stored; only its SHA-256 digest, title, version and tracks.
- Breach references hold an opaque `caseReference`, subject id, track, policy version, severity and
  status. No narrative, evidence or reporter identity, and views omit `recordedBy`/`resolvedBy`.
- Audit entries carry actor, roles, action, resource id, outcome, hashes and timestamps only. Denied
  and failed attempts are recorded with outcome `denied`/`failed`.
- Access is deny-by-default: unknown roles, missing identity and tenant mismatches are rejected.
  Note the repo-wide limitation that the JWT carries no tenant claim, so the path `tenantId` is the
  tenant boundary (same as `project-milestones`). Bind it to a verified claim when one exists.

## Dependencies

- Optional `CONDUCT_NOTIFIER` provider (`ConductNotifier.reacknowledgementRequired`). Its failure
  never rolls back a published policy; it is audited as `policy.notify` with outcome `failed`.
- Restricted case ids come from the trust-and-safety system; policy text lives in the content system.

## Rollout and rollback

Additive: register `CapstoneConductModule` (already in `AppModule`), publish the first policy, then
call `assertCompliant` from capstone modules behind a feature flag. Until a policy is published,
every user is compliant, so rollout cannot lock anyone out. Roll back by removing the
`assertCompliant` calls; the module can stay deployed. Data is in-memory, so a restart clears
policies, acknowledgements and breach references until a persistent repository replaces
`CapstoneConductRepository`.

## Cross-repository work

CAPSTONE-055 also has frontend (acknowledgement gate and re-acknowledgement prompt), contracts
(policy-version and acknowledgement-event schema), and trust-and-safety (case-reference issuance)
counterparts in their repositories. Link them in the PR description.
