# Worker uploads: hardening, quarantine and malware scanning

Covers the previously public `POST /worker/upload` endpoint
([`src/worker`](../../src/worker)).

## What changed

**Before:** the controller was `@Public()`, wrote caller-influenced files
straight to `uploads/worker` via `diskStorage`, trusted the declared
`Content-Type`, and returned the stored filename immediately. There was no
quarantine, no scanning and no quota.

**After:** uploads require authentication, are buffered in memory, validated on
MIME *and* magic bytes, stored under a generated name outside any served tree,
scanned, and only then made readable.

## Request lifecycle

```
POST /worker/upload
  │
  ├─ JwtAuthGuard + RolesGuard        admin | moderator | tutor only
  ├─ multer memoryStorage             10 MiB hard cap, 1 file, 10 fields
  ├─ MIME pre-filter                  application/pdf, image/png, image/jpeg
  ├─ size check                       UPLOAD_MAX_FILE_BYTES
  ├─ magic byte validation            MIME + extension + signature must agree
  ├─ quota check                      per-user bytes and file count
  ├─ write to <root>/quarantine/      random UUID name, mode 0600
  │                                   → audit: file_upload.quarantined
  ├─ malware scan
  │    ├─ clean    → move to <root>/clean/   status "clean"
  │    ├─ infected → delete (or move to <root>/infected/) status "infected"
  │    └─ error    → stays quarantined       status "error"
  │                                   → audit: file_upload.scanned
  └─ response with status; downloadUrl only when status is "clean"
```

Nothing untrusted touches the filesystem until it has passed validation, and
nothing leaves quarantine until a scan says so.

## Endpoints

| Method   | Path                        | Notes                                                     |
| -------- | --------------------------- | --------------------------------------------------------- |
| `POST`   | `/worker/upload`            | Authenticated. Returns the upload record and its status.  |
| `GET`    | `/worker/files`             | Your uploads and their scan status.                       |
| `GET`    | `/worker/files/:id`         | Metadata for one upload. Owner or platform admin.         |
| `GET`    | `/worker/files/:id/content` | Bytes. **409** unless the status is `clean`.              |
| `DELETE` | `/worker/files/:id`         | Deletes the record and the stored bytes.                  |

All require a bearer token and one of `admin`, `moderator`, `tutor`.

### Breaking changes

- The endpoint is **no longer public** — unauthenticated callers get 401, and
  authenticated callers outside the three roles get 403.
- The response no longer contains a `filename` field. It returns `id`, `status`,
  `sha256`, `scan` and a `downloadUrl` that is `null` until the file is
  released. Clients must poll or re-read `GET /worker/files/:id` rather than
  assuming the upload is immediately usable.
- Uploads are written under `UPLOAD_STORAGE_ROOT` (default `var/uploads`), not
  `uploads/worker`.

### Status values

| Status     | Meaning                                     | Readable |
| ---------- | ------------------------------------------- | -------- |
| `pending`  | Accepted, quarantined, not yet scanned      | no       |
| `scanning` | Scan in flight                              | no       |
| `clean`    | Scanned clean and released                  | **yes**  |
| `infected` | Detection; bytes deleted or quarantined     | no       |
| `error`    | Scanner gave no verdict; stays quarantined  | no       |

`error` is deliberately unreadable — the scanner fails closed, so an unreachable
clamd never looks like a pass.

## Validation

An upload is accepted only when the declared MIME type, the filename extension
and the leading magic bytes all agree:

| MIME              | Extensions      | Signature                    |
| ----------------- | --------------- | ---------------------------- |
| `application/pdf` | `.pdf`          | `%PDF-`                      |
| `image/png`       | `.png`          | `89 50 4E 47 0D 0A 1A 0A`    |
| `image/jpeg`      | `.jpg`, `.jpeg` | `FF D8 FF`                   |

A PE executable named `invoice.pdf` and sent as `application/pdf` is rejected,
because its bytes start with `MZ`. Rejections are audited as
`file_upload.rejected` with outcome `denied`.

## Storage

- The root defaults to `var/uploads`, outside any directory the application
  serves, with three areas: `quarantine/`, `clean/` and `infected/`.
- Storage names are `crypto.randomUUID()` plus a validated extension. The
  caller's filename never influences a path; it is sanitized (basename only,
  control characters stripped, leading dots removed, capped at 128 characters)
  and kept as display metadata.
- Files are written mode `0600` inside directories created `0700`, with
  `flag: 'wx'` so an existing file is never overwritten.
- `resolveWithin` rejects any key that resolves outside its area — a backstop
  against a future caller passing a user-supplied key.
- Downloads are always served `Content-Disposition: attachment` with
  `X-Content-Type-Options: nosniff`, so uploaded content is never rendered
  inline on the API origin.

## Malware scanning

Two backends, selected by `MALWARE_SCAN_PROVIDER`:

- **`builtin`** (default) — detects the EICAR test string plus active content
  smuggled into documents and images: PDF `/OpenAction` + `/JavaScript`,
  embedded `/JS`, `/Launch` actions, `<script>` tags, `<?php` tags and
  shebangs. No external dependency, so it works in CI and locally. It is a
  defence-in-depth layer, **not** a replacement for a real engine.
- **`clamav`** — streams the buffer to a clamd daemon over TCP using the
  INSTREAM protocol. Recommended for production.

Use the EICAR test string to exercise the quarantine path end to end without
handling a real sample.

## Configuration

| Variable                  | Default        | Purpose                                          |
| ------------------------- | -------------- | ------------------------------------------------ |
| `UPLOAD_STORAGE_ROOT`     | `var/uploads`  | Storage root; keep outside any served directory  |
| `UPLOAD_MAX_FILE_BYTES`   | `5242880`      | Max size of a single upload                      |
| `UPLOAD_QUOTA_MAX_BYTES`  | `104857600`    | Max total stored bytes per user                  |
| `UPLOAD_QUOTA_MAX_FILES`  | `20`           | Max uploads per user per window                  |
| `UPLOAD_QUOTA_WINDOW_MS`  | `86400000`     | Rolling window for the file-count quota          |
| `UPLOAD_RETAIN_INFECTED`  | `false`        | Keep detections under `infected/` instead of deleting |
| `MALWARE_SCAN_PROVIDER`   | `builtin`      | `builtin` or `clamav`                            |
| `MALWARE_SCAN_HOST`       | `127.0.0.1`    | clamd host                                       |
| `MALWARE_SCAN_PORT`       | `3310`         | clamd port                                       |
| `MALWARE_SCAN_TIMEOUT_MS` | `30000`        | Scan timeout; a timeout yields `error`, not `clean` |

## Deployment notes

- Add `UPLOAD_STORAGE_ROOT` to your volume mounts — uploads are not in the
  application directory. `var/` is git-ignored.
- Enable `clamav` in production and keep its definitions current.
- Scanning currently runs inline within the request. The lifecycle is modelled
  explicitly (`pending` → `scanning` → verdict), so moving the scan to a queue
  later needs no API change.

## Tests

- `src/worker/worker.service.spec.ts` — lifecycle, quotas, release/quarantine,
  download refusal per status, ownership, scan auditing
- `src/worker/file-validation.spec.ts` — magic bytes, content-type confusion,
  filename sanitization and traversal
- `src/worker/file-storage.service.spec.ts` — quarantine-first writes, generated
  names, permissions, area escape refusal
- `src/worker/malware-scanner.service.spec.ts` — EICAR, heuristics, fail-closed
  behaviour when clamd is unreachable
