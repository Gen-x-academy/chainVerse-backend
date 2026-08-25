# E-Library holds

Title-level hold placement, FIFO/priority queueing, physical pickup windows,
and cancellation for the e-library. Implements #1025–#1028.

Module: `src/library-holds/` (`LibraryHoldsModule`). Registered in
`src/app.module.ts`.

## Domain model

| Collection | Purpose |
|---|---|
| `books` | A title. `type` is `physical` or `ebook_license`; `totalCopies` is the number of lendable units; `maxActiveHoldsPerUser` and `pickupWindowDays` are per-title policy knobs (defaults: 3 and 3). |
| `book_copies` | One lendable unit per document — a physical barcode or an ebook license seat. `status`: `available`, `on_hold`, `checked_out`, `lost`, `withdrawn`. |
| `library_holds` | One row per patron queue entry for a title. `status`: `active` (queued) → `ready` (physical, reserved for pickup) or `fulfilled` (ebook granted, or physical picked up) → terminal; or `cancelled` / `expired`. |
| `library_closures` | Calendar dates the library is closed, used to extend physical pickup deadlines. |
| `hold_audit_logs` | Append-only event log per hold (`placed`, `ready`, `fulfilled`, `expired`, `cancelled`, `priority_changed`). |

## Placement (#1025)

`POST /api/library/books/:bookId/holds` — students and tutors only.

- **Duplicate prevention**: a partial unique index on
  `{ bookId, userId }` (scoped to `status in [active, ready]`) is the source
  of truth — not an application-level check — so two concurrent requests for
  the same title can never both create a hold.
- **Idempotent**: if the caller already has an active/ready hold on the
  title, that hold is returned instead of erroring (including when the
  unique index rejects a racing insert).
- **Limits**: a user may not exceed `Book.maxActiveHoldsPerUser` concurrent
  active/ready holds on a title.
- If a copy/license is free at placement time, the hold is allocated
  immediately (see below) instead of sitting in `active`.

## Queue ordering and priority (#1026)

Every hold stores `priority` (`normal` | `high`) and a derived numeric
`priorityRank`. Default policy: tutors get `high`, students get `normal`
(`DEFAULT_PRIORITY_BY_ROLE` in `library-holds.service.ts`). Staff can
override a **queued** hold's priority via:

`PATCH /api/library/holds/:holdId/priority` — admin/moderator only, `reason`
required, written to the audit log. Only holds still in `active` status can
be re-prioritized — once a hold is `ready`/`fulfilled` its position no
longer matters, so priority changes are never retroactive to a completed
allocation.

Ordering is `priorityRank desc, _id asc` — Mongo's `_id` is
monotonically increasing per collection, so ties always resolve to
insertion order deterministically. The same sort powers both the allocator
and `GET` responses' `queuePosition` field.

## Allocation

Allocation is compare-and-swap based, not a multi-document transaction:

1. Atomically claim one `available` copy (`findOneAndUpdate` with a status
   filter — only one caller can win a given document).
2. Atomically claim the next `active` hold for that title, sorted by
   priority/insertion order (`findOneAndUpdate` with `sort`).
3. If step 2 finds nobody, the copy claimed in step 1 is put back.

This guarantees a copy is awarded to exactly one hold even when allocation
is triggered concurrently (placement, return, expiration, cancellation all
call the same internal `allocateNext`).

- **Physical** copies move the hold to `ready` and compute a pickup deadline.
- **Ebook licenses** skip the pickup window entirely and go straight to
  `fulfilled` — there's nothing to pick up.

## Pickup window and expiration (#1027)

`Book.pickupWindowDays` (default 3) is added to the allocation date, then
pushed forward a day at a time past any date present in `library_closures`
so a hold never expires on a day the library was closed
(`computePickupDeadline` in `utils/pickup-window.util.ts`).

- `POST /api/library/closures` — admin/moderator, registers a closure date.
- A ready hold's copy cannot be claimed by anyone else while `on_hold`.
- Expiration runs automatically once an hour (`@Cron('0 * * * *')` on
  `LibraryHoldsService.expirePickupWindows`) and can be triggered manually
  via `POST /api/library/holds/expire-pickups` (admin/moderator). Each
  expiry is a compare-and-swap (`ready` → `expired`) so a hold already
  claimed by a manual run and the cron in the same tick expires exactly
  once, and the freed copy is handed to the next hold via the same
  `allocateNext` path as a return.
- `POST /api/library/holds/:holdId/pickup` — admin/moderator confirms an
  in-person pickup, moving `ready` → `fulfilled` and the copy to
  `checked_out`.
- `POST /api/library/copies/:copyId/return` — admin/moderator marks a copy
  available again (e.g. a physical return) and immediately reallocates it.

## Cancellation (#1028)

`DELETE /api/library/holds/:holdId`

- Borrowers may cancel their own `active` or `ready` hold; `reason` is
  optional.
- Staff (admin/moderator) cancelling another user's hold **must** supply
  `reason` (400 if missing/blank).
- Cancellation is a compare-and-swap on `status in [active, ready]`; a
  second cancel attempt (or any other terminal transition racing it) gets a
  409, not a duplicate cancellation.
- If the cancelled hold was `ready` (had a copy reserved), the copy is
  released and reallocated via the same CAS-based `allocateNext` used
  everywhere else — the next patron is allocated exactly once.

## Authorization summary

| Endpoint | Roles |
|---|---|
| `POST /library/books`, `POST /library/books/:id/copies`, `POST /library/closures` | admin, moderator |
| `GET /library/books`, `GET /library/books/:id` | admin, moderator, tutor, student |
| `POST /library/books/:id/holds`, `GET /library/holds/me` | student, tutor |
| `GET /library/holds/:id`, `DELETE /library/holds/:id` | owner, or admin/moderator |
| `PATCH /library/holds/:id/priority`, `POST /library/holds/:id/pickup`, `POST /library/copies/:id/return`, `POST /library/holds/expire-pickups` | admin, moderator |

All routes require a bearer access token (`JwtAuthGuard` + `RolesGuard`,
consistent with the rest of the API).

## Not covered

Full circulation (checkout duration, fines, ebook license expiry/renewal)
is out of scope — this module only covers the hold lifecycle up to the
point a copy/license is handed to a patron.
