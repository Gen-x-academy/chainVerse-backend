# Project funding lifecycle

Backend implementation of the Funding track work items **CAPSTONE-081** through **CAPSTONE-084**.

| Issue | Capstone item | Endpoint                                           |
| ----- | ------------- | -------------------------------------------------- |
| #1591 | CAPSTONE-081  | `POST /api/v1/project-funding/funding-models`      |
| #1592 | CAPSTONE-082  | `POST /api/v1/project-funding/budget-plans`        |
| #1593 | CAPSTONE-083  | `POST /api/v1/project-funding/budget-reservations` |
| #1594 | CAPSTONE-084  | `POST /api/v1/project-funding/escrow-intents`      |

Module: `src/project-funding/`, registered as `ProjectFundingModule` in `src/app.module.ts`. Interactive Swagger documentation is generated at `/api/docs` under **Project Funding Lifecycle**.

## Endpoints and roles

All four endpoints require a bearer token issued by the existing auth layer and the `x-tenant-id` header. Authorization is deny-by-default: the request is rejected unless the authenticated role is explicitly allowlisted for that endpoint and the tenant header matches the tenant in the request body.

| Operation               | Allowed roles                                    |
| ----------------------- | ------------------------------------------------ |
| Configure funding model | `sponsor`, `finance`, `program-manager`, `admin` |
| Create budget plan      | `sponsor`, `finance`, `program-manager`, `admin` |
| Reserve approved budget | `sponsor`, `finance`, `program-manager`, `admin` |
| Create escrow intent    | `sponsor`, `finance`, `program-manager`, `admin` |

Separation of duties applies to budget approval: a plan above `approvalThresholdMinor` requires `approverId` and `approverRole` where the role is `finance`, `program-manager` or `admin`, and the approver is not the acting principal. `student`, unknown roles, missing actors and missing tenant boundaries receive `403`.

## Domain model

1. **Funding model (CAPSTONE-081)** — supports `unfunded`, `grant`, `milestone`, `reimbursement`, `stipend`, `bounty` and `sponsor-funded`. It records asset code/issuer, payer, recipient shares in basis points, platform and flat fees, committed amount in integer minor units, and an expiry. Configuring a model also establishes a tenant-scoped funding pool capped at the committed amount.
2. **Budget plan (CAPSTONE-082)** — references a configured model, stores categorised line items with quantities, justifications, funding sources and versioned totals in integer minor units. Line ids are unique, line totals are positive safe integers, and the committed-funding ceiling is enforced.
3. **Budget reservation (CAPSTONE-083)** — requires an approved plan, matching currency, a future expiry no later than the pool expiry, a matching expected revision, and enough capacity in both the funding pool and the remaining approved budget. Reservations are written atomically and the plan revision advances after each accepted decision.
4. **Escrow intent (CAPSTONE-084)** — requires an approved budget for an accepted charter, the configured payer, a supported asset (`USD`, `USDC`, `XLM`), matching currency, a future expiry and at least one unique release condition. The amount cannot exceed the approved total minus existing reservations and prior intents.

Revisions are optimistic concurrency tokens. Create requests use `expectedRevision: 0`; revisions increase by one on every accepted change. A stale revision receives `409`.

## Validation and error handling

Request bodies are validated with `class-validator` DTOs before service execution. Validation failures return stable `VAL_*` error codes with field names only. Domain rule failures return `BIZ_*` codes, authorization failures return `AUTH_INSUFFICIENT_PERMISSIONS`, and missing dependencies return `RES_NOT_FOUND`. Details never include submitted private values.

No floating point is used for money. Amounts are positive integer minor units, fee shares are basis points, and all identifiers are constrained to a safe character set.

## Idempotency and concurrency

Every mutation carries a client-generated `requestId` (8–128 safe characters). The repository stores a SHA-256 fingerprint of the action, tenant, request id and full payload. Retrying the same key with the same payload returns the original result with `replayed: true` and performs no second write or audit entry. Reusing the key with a different payload returns `409 BIZ_IDEMPOTENCY_KEY_REUSED`.

Repositories are in-memory `Map`s keyed first by tenant. Checks, writes and receipt recording happen synchronously before any await, so concurrent retries with the same key are serialised to one mutation. The in-memory design is deliberate for this workstream; a production deployment should replace `ProjectFundingRepository` with a durable, transactionally unique tenant-partitioned store while keeping the service contract unchanged.

## Audit and privacy

`ProjectFundingAuditService` appends metadata-only entries containing `actorId`, `actorRole`, `tenantId`, `action`, `entityId` and `timestamp`. It explicitly projects allowed fields, so private payloads such as budget justifications, payer identifiers, proposal text or token-like fields cannot enter the audit trail even if a caller supplies them. The module does not log request bodies or responses.

Budget plan responses deliberately omit `justification`. Payer ids are returned only where the caller needs them to reconcile an escrow intent, and are never audited. Keep private proposal, research, identity, safety and financial content off public ledgers and logs.

## Dependencies and rollout

Dependencies: existing JWT authentication (`JwtAuthGuard`), global validation pipe, global exception filter, Swagger, and the caller-supplied tenant boundary header. The module does not depend on other CAPSTONE modules and does not persist to MongoDB.

Rollout: deploy with the module enabled behind normal auth; no schema migration is needed. Because state is in-memory, restart clears records — suitable for the audited baseline and tests, not for long-lived financial records. Rollback is removing `ProjectFundingModule` from `AppModule`; no persisted data is left behind.

## Cross-repository references

| Item         | Backend (this repo) | Frontend                                                                                      | On-chain                                                                                    |
| ------------ | ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| CAPSTONE-081 | #1591               | [chainVerse-frontend #1507](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1507) | [chainVerse-onchain #1429](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1429) |
| CAPSTONE-082 | #1592               | [chainVerse-frontend #1508](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1508) | [chainVerse-onchain #1430](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1430) |
| CAPSTONE-083 | #1593               | [chainVerse-frontend #1509](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1509) | [chainVerse-onchain #1431](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1431) |
| CAPSTONE-084 | #1594               | [chainVerse-frontend #1510](https://github.com/Gen-x-academy/chainVerse-frontend/issues/1510) | [chainVerse-onchain #1432](https://github.com/Gen-x-academy/chainVerse-onchain/issues/1432) |

The frontend contract mirrors these request fields (`requestId`, tenant/project ids, integer minor amounts, recipient shares, release conditions). On-chain work consumes the emitted intent terms; this module never signs or submits transactions.

## Tests

```bash
npx jest --runTestsByPath \
  src/project-funding/project-funding.service.spec.ts \
  src/project-funding/project-funding-validation.spec.ts \
  src/project-funding/project-funding.controller.spec.ts \
  --runInBand
```
