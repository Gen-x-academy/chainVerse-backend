# Issue #1300 — Clean Up `src/digitalrendition` (Entities Only, No Module)

## Summary

`src/digitalrendition/entities/renditionaccess.ts` contains a full implementation stub — entity, DTOs, service, controller, module, and a database migration — bundled into a single file. However, the directory has no `module.ts`, no `controller.ts`, no `service.ts`, and is not wired into `app.module.ts`. The code exists but is inert.

This issue tracks completing the migration of that stub into a proper, wired NestJS module.

---

## Current State

### What exists

```
src/digitalrendition/
└── entities/
    └── renditionaccess.ts   ← monolithic stub file
```

`renditionaccess.ts` contains **all** of the following concatenated together:

| Section | Description |
|---|---|
| `RenditionAccessToken` entity | TypeORM entity for `rendition_access_tokens` table |
| `CreateRenditionAccessTokenDto` | Validates `purpose` (`read` \| `download`) and optional `ttlSeconds` (30–900) |
| `RenditionAccessTokenResponseDto` | OpenAPI-annotated response shape |
| `DigitalRenditionStorageService` | Adapter stub; `getContent()` throws `NotFoundException` until wired to real storage |
| `DigitalRenditionsService` | Full business logic: token creation, validation, single-use enforcement, loan re-check at consume time |
| `DigitalRenditionsController` | REST controller: `POST /:renditionId/access-token` and `GET /:renditionId/content` |
| `DigitalRenditionsModule` | NestJS module declaration |
| Migration `1727190000000` | Creates `rendition_access_tokens` table with all indexes |
| Service spec | Jest unit tests for `DigitalRenditionsService` |

### What is missing

- Individual files split by concern (entity, DTOs, service, controller, module, migration, spec).
- The module is **not imported** in `app.module.ts`.
- The migration file is not in `src/database/migrations/`.
- The storage adapter is a stub that always throws — it must be connected to the project's actual storage layer (S3/GCS/Azure/local).
- Loan and rendition repository adapters are declared as interfaces but have no concrete implementations wired in.

---

## Required Actions

### 1. Split the stub into proper files

Extract the content of `renditionaccess.ts` into the standard NestJS structure:

```
src/digital-renditions/
├── entities/
│   └── rendition-access-token.entity.ts
├── dto/
│   ├── create-rendition-access-token.dto.ts
│   └── rendition-access-token-response.dto.ts
├── digital-renditions.storage.ts
├── digital-renditions.service.ts
├── digital-renditions.controller.ts
├── digital-renditions.module.ts
└── tests/
    └── digital-renditions.service.spec.ts
```

> The stub already uses the `digital-renditions` naming convention internally — match it.

### 2. Move the migration

Copy the migration class `CreateRenditionAccessTokens1727190000000` into:

```
src/database/migrations/1727190000000-create-rendition-access-tokens.ts
```

Verify the timestamp does not conflict with existing migration files.

### 3. Wire the module into `app.module.ts`

Add `DigitalRenditionsModule` to the `imports` array in `src/app.module.ts`.

### 4. Implement the storage adapter

Replace the `throw new NotFoundException(...)` stub in `DigitalRenditionStorageService.getContent()` with the project's existing storage implementation. The controller must never receive a direct storage (bucket) URL — content must be proxied through the API.

### 5. Wire the loan and rendition repository adapters

`DigitalRenditionsService` depends on two adapter interfaces:

```ts
interface LoanRepository {
  findActiveForPatronAndRendition(patronId, renditionId): Promise<PatronLoan | null>
  findForPatron(loanId, patronId): Promise<PatronLoan | null>
}

interface RenditionRepository {
  findById(id): Promise<Rendition | null>
}
```

Provide concrete implementations using the project's existing loan and rendition data sources, and register them as providers in `DigitalRenditionsModule`.

### 6. Delete the original stub

Remove `src/digitalrendition/entities/renditionaccess.ts` and the now-empty `src/digitalrendition/` directory once the split files are in place.

---

## Entity: `RenditionAccessToken`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `tokenHash` | varchar(64) | Unique index — only the SHA-256 hash is stored, never the raw token |
| `patronId` | uuid | Indexed |
| `loanId` | uuid | Indexed |
| `renditionId` | uuid | Indexed |
| `purpose` | varchar(32) | `'read'` or `'download'` |
| `expiresAt` | timestamptz | Indexed |
| `usedAt` | timestamptz \| null | Set atomically on consumption; null = not yet used |
| `createdAt` | timestamptz | Auto-set on insert |

---

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/digital-renditions/:renditionId/access-token` | Bearer JWT | Issues a short-lived single-use access token |
| `GET` | `/digital-renditions/:renditionId/content?token=...` | Query token | Consumes the token and streams the rendition |

### Token lifecycle

1. `POST` — patron must have an `ACTIVE` loan for the rendition. A cryptographically random 256-bit token is generated; only its SHA-256 hash is persisted. TTL defaults to 300 seconds (configurable 30–900 s).
2. `GET` — token is looked up by hash, all authorization properties are re-verified (rendition match, purpose match, loan status, expiry, single-use). The `usedAt` column is set atomically via a conditional UPDATE to prevent replay under concurrent requests.
3. Content is streamed through the API with `Cache-Control: private, no-store`. Storage URLs are never exposed.

---

## Security Properties

- **Single-use**: `usedAt IS NULL` check in the atomic UPDATE prevents token replay.
- **Loan re-check at consume time**: Returning or revoking a loan immediately invalidates any previously issued tokens.
- **No raw token storage**: Only the SHA-256 hash is stored; a database breach does not expose usable tokens.
- **Purpose binding**: A `read` token cannot be escalated to `download`.
- **No browser caching**: `Cache-Control: private, no-store` and `Pragma: no-cache` on stream responses.

---

## Acceptance Criteria

- [ ] `src/digitalrendition/` is removed.
- [ ] All code lives in `src/digital-renditions/` in properly named files.
- [ ] The migration is in `src/database/migrations/` with no timestamp conflict.
- [ ] `DigitalRenditionsModule` is imported in `app.module.ts`.
- [ ] The storage adapter is connected to real storage (not a stub that always throws).
- [ ] Loan and rendition adapters have concrete implementations wired as providers.
- [ ] OpenAPI documentation reflects both endpoints.
- [ ] No `.rs` files or unrelated code in the directory.

---

## Dependencies

| Dependency | Notes |
|---|---|
| Project storage layer | S3 / GCS / Azure / local — must be identified and connected |
| Loan domain | Existing loan repository or service |
| Rendition domain | Existing rendition repository or service |
| TypeORM migration runner | Must be run after the migration file is placed |

---

## References

- GitHub Issue: [#1300](https://github.com/Gen-x-academy/chainVerse-backend/issues/1300)
- Stub source: `src/digitalrendition/entities/renditionaccess.ts`
