# Offline Downloads (controlled offline-download authorization)

Patrons with an active digital loan may request **offline grants** so a
specific rendition stays playable/readable without a live connection. A grant
is a scoped capability that binds five things:

- **patron** (`patronId`),
- **loan** (`loanId`),
- **rendition** (`renditionId`),
- a **device**, held only as a SHA-256 hash of an opaque client device id
  (`deviceIdHash`) — the raw identifier is never persisted,
- an **expiry** (`expiresAt`) that can never exceed the loan expiry.

## How it works

1. `POST library/offline/grants` — the patron registers one device against an
   active loan + rendition. The response contains an opaque `grantToken`
   (a bearer capability) plus the effective values. Creations are
   idempotent per `(loan, rendition, device)`: re-registering the same device
   returns the existing active grant.
2. `GET library/offline/grants` — lists the caller's grants, most recent
   first. Expired grants are reconciled to `expired` lazily on read.
3. `POST library/offline/verify` — the offline client presents
   `{ grantToken, deviceId }`. The server derives the device hash and only
   authorizes when **all** of the following hold:
   - the grant exists, is `active`, and was issued to the calling patron;
   - the derived device hash matches the stored hash;
   - the grant expiry and the loan expiry have not passed;
   - the backing loan is still `active` and has not had `accessRevoked` set.
   Otherwise the endpoint returns `403` with
   `BIZ_OFFLINE_DOWNLOAD_DENIED`.
4. `DELETE library/offline/grants/:grantId` — revokes a grant (owner only);
   a revoked grant can never authorize again.

## Device limits

`allowedDeviceCount` (`1..10`, default `1`) caps how many **active** grants
may exist for a given `(patron, loan, rendition)`. Creating a grant beyond the
limit fails with `BIZ_OFFLINE_DEVICE_LIMIT`. The limit check and insert run
inside a Mongo transaction when the deployment supports it (`LibraryTransactionRunner`).

Revoking a device frees its slot, so a patron can rotate devices.

## Privacy

Only `sha256(deviceId)` is stored; the raw device id is validated
(`8..512` chars) and used once to compute the hash, then discarded. No
persistent, forensically-rich device data is retained.

## Serving the actual asset

This feature owns **authorization**, not asset delivery. The rendition storage
integration should call `OfflineGrantService.authorizeDownload(...)` before
streaming/downloading an offline file; the returned
`{ valid, editionId, renditionId, expiresAt }` payload (or the `verify`
endpoint) is the contract the delivery layer must enforce.

## Error codes introduced

| Code | Meaning |
| --- | --- |
| `RES_OFFLINE_GRANT_NOT_FOUND` | No grant with the given id |
| `BIZ_LOAN_EXPIRED` | Loan has already expired |
| `BIZ_OFFLINE_DEVICE_LIMIT` | Active device count reached for the rendition |
| `BIZ_OFFLINE_GRANT_INACTIVE` | Attempt to revoke a non-active grant |
| `BIZ_OFFLINE_DOWNLOAD_DENIED` | Capability token / loan / device check failed |