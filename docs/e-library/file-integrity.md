# File Integrity Verification & Quarantine

Stored digital renditions are verified against their **recorded SHA-256
checksums**. Corrupted or replaced assets are quarantined — new access is
blocked and staff are alerted — but the file is **never deleted
automatically**.

## Recording checksums

`POST library/integrity/renditions` records the expected checksum for a
rendition (`editionId`, `renditionId`, 64-char hex `sha256`, `sizeBytes`). The
record starts as `unverified`. Registering a checksum twice for the same
rendition is a conflict (`BIZ_RENDITION_ALREADY_REGISTERED`).

## Bounded, resumable integrity passes

`POST library/integrity/verify` with an optional `batchSize` (default 50,
max 1000) runs **one bounded pass** over at most `batchSize` integrity records,
ordered by `_id`:

- If a pass is already `running`, the next call **resumes** it from its stored
  cursor (no new job is created).
- If the batch is exactly full, the job stays `running` with an updated cursor,
  so a later call continues where it left off.
- If the batch is shorter than `batchSize`, the job is marked `completed`.
- An unexpected error marks the job `failed` with `lastError`; the next call
  resumes a `running` job only, so a failed pass is not auto-retried.

Per rendition:
- **match** → `passed` (`lastVerifiedAt`, `actualSha256` recorded),
- **mismatch** → `quarantined`, `quarantinedAt`, `quarantinedReason`, and the
  configured alert notifier is invoked (`notifyFailed`),
- already quarantined or content unreadable → counted as `skipped`.

Jobs are inspectable via `GET library/integrity/jobs` and
`GET library/integrity/jobs/:jobId`.

## Blocking new access

`RenditionIntegrityService.assertNotQuarantined(renditionId)` throws
`BIZ_RENDITION_QUARANTINED` when a rendition is quarantined. Streaming /
download gateways must call this before starting a **new** access session.
In-flight sessions are unaffected. A missing integrity record is treated as
"not quarantined" (integrity registration is opt-in per rendition).

## Reviewing and resolving quarantine

`POST library/integrity/renditions/:renditionId/quarantine` — manual
quarantine with a reason. `POST .../unquarantine` with:

- `resolution: "confirmed"` — the stored file is the intended copy → `cleared`,
- `resolution: "reseeded"` — a corrected `newSha256` was recorded → back to
  `unverified` so the next pass re-checks it.

## Storage adapter seam

Live passes read bytes through `IntegrityContentReader` (injection token
`IntegrityContentReader`). The default `NoopIntegrityContentReader` returns
`null` (renditions are reported as `skipped`/unverifiable), so deployments must
bind an adapter to their rendition storage layer. Staff alerting is bound to
`IntegrityAlertNotifier` (default logs a structured error); bind a real channel
(email/pager) for production.

## Error codes introduced

| Code | Meaning |
| --- | --- |
| `RES_RENDITION_INTEGRITY_NOT_FOUND` | No integrity record for the rendition |
| `RES_INTEGRITY_JOB_NOT_FOUND` | No integrity job with the given id |
| `BIZ_RENDITION_ALREADY_REGISTERED` | Checksum already registered |
| `BIZ_RENDITION_ALREADY_QUARANTINED` | Rendition is already quarantined |
| `BIZ_RENDITION_NOT_QUARANTINED` | Resolve attempted on a non-quarantined rendition |
| `BIZ_RENDITION_QUARANTINED` | New access blocked for a quarantined rendition |