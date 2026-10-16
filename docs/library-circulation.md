# E-Library / Circulation

Base path: `library/circulation`. All routes require a bearer JWT
(`Authorization: Bearer <token>`); role requirements are noted per route.

## Roles

- **student** — self-service checkout/return/renewal, own loans, own receipts, holds.
- **librarian** / **admin** — "library staff": patron lookup, staff-assisted
  circulation, due-date override requests.
- **admin** only — resolves ("elevated approval") due-date overrides that
  exceed staff authority.

## Routes

| Method | Path | Roles | Idempotent |
| --- | --- | --- | --- |
| POST | `/items` | librarian, admin | no |
| POST | `/checkout` | student, librarian, admin | yes |
| POST | `/:loanId/return` | student, librarian, admin | yes |
| POST | `/:loanId/renew` | student, librarian, admin | yes |
| GET | `/my-loans` | student | no |
| POST | `/holds` | student | no |
| GET | `/receipts/:transactionId` | owner or staff | no |
| GET | `/patrons/:patronId/loans` | librarian, admin | no (rate-limited) |
| POST | `/:loanId/due-date-override` | librarian, admin | no |
| POST | `/due-date-overrides/:overrideId/resolve` | admin | no |

## Idempotency (checkout / return / renew)

Every mutation above requires an `X-Idempotency-Key` header. The key is
scoped to (actor, endpoint) and the request payload:

- Same actor + endpoint + key + payload → the original response is replayed
  verbatim, the handler does not run again.
- Same actor + endpoint + key with a **different** payload → `409 Conflict`
  (`BIZ_DUPLICATE_REQUEST`). Callers must mint a new key per logical
  operation.
- Records expire after 24h (MongoDB TTL index); the key may be reused after
  expiry.

This is implemented generically in `src/idempotency` and applied via
`@Idempotent()` + `IdempotencyInterceptor` — reusable by any other module.

## Circulation policy

- Standard loan period: 14 days. Max renewals: 2 (`library-circulation.constants.ts`).
- Renewal is blocked once the limit is reached or while another patron holds
  the item.

## Due-date overrides (#1024)

A staff-requested override is recorded immediately as its own audit record
(loan history is never edited in place). It is either:

- **Applied immediately** — when the new date is within
  `MAX_STAFF_OVERRIDE_EXTENSION_DAYS` (30 days) of the original due date and
  no other patron holds the item.
- **Pending elevated approval** — when it exceeds that limit or conflicts
  with an active hold. Only `admin` can resolve (`approve`/`reject`) a
  pending override via `POST /due-date-overrides/:overrideId/resolve`; the
  loan's due date is only mutated once approved.

## Patron lookup (#1021)

`GET /patrons/:patronId/loans` is restricted to library staff, rate-limited
to 10 requests/minute per staff member, and every call writes a
`PatronLookupAudit` record (staffId, patronId, result count, request id).
The response is a redacted loan summary (title/author/status/dates) — no
staff-internal identifiers or unrelated patron PII.

## Receipts (#1022)

Checkout and return each produce an immutable `CirculationReceipt` keyed by
an opaque `transactionId` (never the Mongo `_id`). Receipts are
owner-accessible (the patron) or staff-accessible, and are never updated
after creation. Creation emits `library.checkout.receipt_created` /
`library.return.receipt_created` domain events, consumed by
`NotificationListener` to create an in-app notification.
