# Certificate download links

Signed, scoped, one-purpose download links protect certificate files from
unauthenticated scraping while still allowing shareable time-limited access.

## Flow

1. An authenticated student who owns the certificate (or staff) calls
   `POST /api/v1/certification/:id/download-link`.
2. The API returns a signed URL with an embedded token that expires after
   `DOWNLOAD_TOKEN_EXPIRY` seconds (default: 3600).
3. The client downloads the file with
   `GET /api/v1/certification/:id/download?token=...`.

Direct downloads without a token are rejected.

## Token binding

Each download token is an HS256 JWT signed with `JWT_SECRET` and carries:

| Claim | Purpose |
|-------|---------|
| `sub` | Requester id from the access token used to create the link |
| `certificateId` | Certificate the link may download |
| `type` | Must be `certificate_download` so access/refresh tokens cannot be reused |
| `exp` | Expiration enforced by the JWT library |

The download handler verifies the signature, expiry, `type`, and that
`certificateId` matches the path parameter. A token minted for certificate A
cannot download certificate B.

## Authorization

Link creation looks up the certificate in `certificate_txs` and applies the same
owner-or-staff rule used elsewhere:

- **Owner** — JWT `sub` matches `CertificateTx.studentId`
- **Staff** — `admin` or `moderator` role

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOWNLOAD_TOKEN_EXPIRY` | `3600` | Single-certificate download token lifetime (seconds) |
| `BULK_DOWNLOAD_TOKEN_EXPIRY` | `7200` | Reserved for a future bulk-download endpoint |
| `BASE_URL` | `http://localhost:3000` | Host used when composing absolute download URLs |
| `JWT_SECRET` | — | Signs download tokens (same secret as access tokens) |

## Error codes

| Code | HTTP | When |
|------|------|------|
| `VAL_MISSING_FIELD` | 400 | Download requested without `token` |
| `AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID` | 401 | Bad signature, wrong `type`, or malformed token |
| `AUTH_CERTIFICATE_DOWNLOAD_TOKEN_EXPIRED` | 401 | Token past `exp` |
| `AUTH_CERTIFICATE_DOWNLOAD_TOKEN_MISMATCH` | 401 | Token `certificateId` does not match path `:id` |
| `RES_CERTIFICATE_NOT_FOUND` | 404 | Unknown certificate id |

## Example

```http
POST /api/v1/certification/cert-abc-123/download-link
Authorization: Bearer <access-token>
```

```json
{
  "downloadUrl": "http://localhost:3000/api/v1/certification/cert-abc-123/download?token=eyJ...",
  "expiresAt": "2026-08-24T12:00:00.000Z",
  "expiresIn": 3600
}
```

```http
GET /api/v1/certification/cert-abc-123/download?token=eyJ...
```

Returns `application/octet-stream` with `Content-Disposition: attachment`.
