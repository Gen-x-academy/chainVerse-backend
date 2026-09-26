# Scholarship Award Agreement Acceptance

**Issue:** [#1152](https://github.com/Gen-x-academy/chainVerse-backend/issues/1152)  
**Domain:** Scholarships — Awards / Legal Acceptance  
**Collection:** `scholarship_award_agreements`

---

## Overview

When an applicant is offered a scholarship award they must formally sign an
agreement that captures:

- **Exact terms version** they accepted (identified by version number and a
  SHA-256 snapshot hash).
- **Verified signer identity** — JWT `sub` matched against `award.applicantId`
  server-side; client IP address recorded for regulatory audit.
- **Required declarations** — five mandatory acknowledgements that must all be
  explicitly set to `true` before the agreement is persisted.
- **Server-side timestamp** — `signedAt` is always set by the server; the
  client never supplies it.

Once created, an `AwardAgreement` document is **immutable**. No field may be
updated or deleted. A duplicate agreement attempt returns 409
`BIZ_AWARD_AGREEMENT_ALREADY_EXISTS`.

---

## Relationship to Adjacent Domain Objects

```
ScholarshipProgram
  └─ ProgramTermsVersion  ◄──── termsSnapshotHash (SHA-256)
ScholarshipApplication
  └─ ScholarshipAward  ◄──────── awardId (unique — one agreement per award)
       └─ AwardAgreement  ◄───── this document
            └─ BudgetReservation  (confirmed atomically on accept-with-agreement)
```

---

## Required Declarations

Every acceptance request must include all five declaration keys with
`acknowledged: true`.

| Key | Meaning |
|---|---|
| `terms_read` | Applicant confirms they have read and understood the full award terms |
| `eligibility_confirmed` | Applicant confirms they meet all stated eligibility conditions |
| `intended_use_confirmed` | Applicant commits to using the award solely for described educational purposes |
| `information_accurate` | Applicant declares their application information was accurate and complete |
| `consequences_understood` | Applicant acknowledges misrepresentation may result in rescission and repayment |

Any missing or `false` key returns **400 `VAL_AGREEMENT_DECLARATIONS_INCOMPLETE`**
listing the specific keys that failed, before any database write occurs.

---

## Terms Version Snapshot

`termsSnapshotHash` is a **SHA-256 hex digest** of the canonical JSON
serialisation of the `ProgramTermsVersion` document's **immutable fields only**:

```json
{
  "versionNumber": 3,
  "eligibility": { ... },
  "deadlines": { ... },
  "awardValue": 5000,
  "awardCurrency": "USD",
  "obligations": [ "..." ]
}
```

Keys are sorted alphabetically before serialisation to guarantee a stable
digest regardless of insertion order.  Mutable administrative fields
(`status`, `publishedAt`, `updatedAt`) are excluded so routine lifecycle
updates to the terms document never invalidate a stored agreement.

The hash can be **verified at any time** without access to the live document
via `GET /scholarships/awards/:awardId/agreement/verify`.

---

## Acceptance Flows

### Flow A — Atomic accept + sign (applicant self-service)

```
POST /scholarships/awards/:awardId/accept-with-agreement
Authorization: Bearer <applicant-JWT>
Body: AcceptAwardWithAgreementDto
```

Single request that accepts the offer and records the signed agreement
atomically.  The service:

1. Resolves the award (tenant-scoped, `organizationId` from body).
2. Verifies `JWT sub === award.applicantId`.
3. Guards against terminal award states (`BIZ_AGREEMENT_DECLINED_OFFER`).
4. Checks acceptance deadline has not passed (`BIZ_AWARD_OFFER_EXPIRED`).
5. Verifies award is `PENDING_ACCEPTANCE` (`BIZ_AWARD_INVALID_STATE`).
6. Checks no agreement already exists (`BIZ_AWARD_AGREEMENT_ALREADY_EXISTS`).
7. Validates all required declarations are acknowledged.
8. Resolves the currently **published** `ProgramTermsVersion` for the award's
   program and computes its snapshot hash.
9. Persists an immutable `AwardAgreement` document.
10. Transitions award `PENDING_ACCEPTANCE → ACCEPTED`.
11. Confirms linked `BudgetReservation` (`PENDING → CONFIRMED`) if present.

The caller does **not** supply `termsVersionNumber` or `termsSnapshotHash` —
the service resolves and records them internally from the program's current
published terms.

### Flow B — Out-of-band staff recording (paper signature)

```
POST /scholarships/awards/:awardId/agreement
Authorization: Bearer <staff-JWT>
Query: ?organizationId=<id>   (resolved by OrganizationRolesGuard)
Body: CreateAgreementDto
Required roles: OWNER | ADMIN
```

Records a signed agreement for an award that has already been transitioned to
`ACCEPTED` via an out-of-band flow (e.g. paper form scanned and uploaded by
staff).

The caller must supply `termsVersionNumber` and `termsSnapshotHash`. The
service re-derives the hash from the stored terms version and rejects the
request if the supplied hash does not match.

---

## API Routes

All routes are under `/scholarships/awards/:awardId/...`.

### Applicant routes (JWT only — no org membership required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/scholarships/awards/:awardId/accept-with-agreement` | Atomic accept + sign (Flow A) |
| `GET` | `/scholarships/awards/:awardId/agreement` | Read own signed agreement |

### Staff routes (JWT + OrganizationRolesGuard)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scholarships/awards/:awardId/agreement` | OWNER, ADMIN | Record out-of-band agreement (Flow B) |
| `GET` | `/scholarships/awards/:awardId/agreement/staff` | OWNER, ADMIN | Read agreement for any award in org |
| `GET` | `/scholarships/awards/:awardId/agreement/verify` | OWNER, ADMIN | Verify `termsSnapshotHash` integrity |

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `RES_AWARD_AGREEMENT_NOT_FOUND` | 404 | No agreement exists for this award |
| `BIZ_AWARD_AGREEMENT_ALREADY_EXISTS` | 409 | An agreement has already been recorded for this award |
| `BIZ_AWARD_AGREEMENT_IMMUTABLE` | 422 | Agreements cannot be modified after creation |
| `BIZ_AGREEMENT_DECLINED_OFFER` | 422 | Award is in a terminal state; no agreement may be recorded |
| `BIZ_AGREEMENT_NOT_ACCEPTED` | 422 | Out-of-band recording requires award to be in `ACCEPTED` state |
| `VAL_AGREEMENT_DECLARATIONS_INCOMPLETE` | 400 | One or more required declarations were not acknowledged |
| `BIZ_AWARD_ACCEPTANCE_FORBIDDEN` | 403 | Caller is not the award's applicant (signer identity mismatch) |
| `BIZ_AWARD_OFFER_EXPIRED` | 422 | Acceptance deadline has passed |
| `BIZ_AWARD_INVALID_STATE` | 422 | Award is not in `PENDING_ACCEPTANCE` state |
| `RES_TERMS_VERSION_NOT_FOUND` | 404 | No published terms version found for the program |

---

## Ownership & Tenant Isolation

- All `AwardAgreement` documents carry `organizationId` (tenant scope).
- Staff routes accept `?organizationId=` as a query parameter; the
  `OrganizationRolesGuard` validates membership before any handler runs.
- The service performs a second ownership assertion on every query.
- Applicant routes use the JWT `sub` matched against `award.applicantId`
  instead of org membership.

---

## Privacy

| Field | Classification | Exposure |
|---|---|---|
| `signerUserId` | PII (internal user id) | OWNER / ADMIN + own applicant |
| `signerIpAddress` | PII (network identifier) | OWNER / ADMIN + own applicant |
| `declarations[].acknowledgedAt` | Audit timestamp | OWNER / ADMIN + own applicant |
| `termsSnapshotHash` | Internal financial/legal | OWNER / ADMIN + own applicant |
| `applicantNote` | May contain applicant PII | OWNER / ADMIN + own applicant |

`signerIpAddress` is **always captured server-side** from `X-Forwarded-For`
(populated by reverse proxies) or `socket.remoteAddress`. The client never
supplies it, preventing IP spoofing in the body.

No agreement data is exposed to unauthenticated callers or other applicants.

---

## Migration

One new collection is created automatically by Mongoose on first use:

**`scholarship_award_agreements`**

No existing collections are modified. No data migration is required.

Indexes created at startup:

| Index | Purpose |
|---|---|
| `{ awardId: 1 }` (unique) | Enforces one agreement per award |
| `{ organizationId: 1 }` | Tenant scoping |
| `{ applicationId: 1 }` | Cross-collection agreement lookup by application |
| `{ programId: 1 }` | Program-level denormalized reference |
| `{ signerUserId: 1 }` | Signer identity lookup |
| `{ organizationId: 1, programId: 1 }` | Program-level audit queries |
| `{ organizationId: 1, signerUserId: 1 }` | Data-subject-access-request queries |

---

## Operational Impact

- **Write-once documents.** No update or delete paths exist. If a document is
  corrupted, it must be investigated at the database level with appropriate
  governance approval — no API endpoint allows mutation.
- **Immutable retention.** Agreement documents must be retained indefinitely for
  legal/compliance purposes. Do **not** add a TTL index without explicit sign-off
  from the legal team.
- **Hash integrity checks.** Staff can call
  `GET /scholarships/awards/:awardId/agreement/verify` at any time to confirm
  `termsSnapshotHash` matches the live `ProgramTermsVersion` document. A
  `valid: false` result indicates either document tampering or a historic
  bug in hash computation and should trigger an incident investigation.
- **Terms version immutability dependency.** The snapshot hash is only
  verifiable as long as the referenced `ProgramTermsVersion` document still
  exists. `ProgramTermsVersion` fields marked `immutable: true` must **never**
  be overwritten. Retiring old versions should only change `status`; immutable
  fields must remain intact.
- **IP address accuracy.** In deployments behind multiple proxy layers, ensure
  the trusted `X-Forwarded-For` header is set by the outermost load balancer.
  Misconfigured proxies may cause the recorded IP to reflect an intermediate
  node rather than the actual client.
