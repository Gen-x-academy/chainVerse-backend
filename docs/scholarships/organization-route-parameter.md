# Organization route parameter

## Convention

Every organization-scoped scholarship route carries the organization in its path as
`:organizationId`:

```text
organizations/:organizationId/scholarships/...
organizations/:organizationId/scholarship-finance/...
```

The name lives in one place, `src/common/decorators/organization-id-param.decorator.ts`:

| Export | Use |
| --- | --- |
| `ORGANIZATION_ID_PARAM` | The parameter name (`organizationId`) |
| `OrganizationIdParam()` | Parameter decorator: reads the path value through `ParseObjectIdPipe` |
| `ORG_SCOPE_FROM_PATH` | Value for `@OrgScope(...)` so `OrganizationRolesGuard` reads the same key |

Do not introduce aliases such as `:orgId`.

## What changed

The controllers under `src/scholarship/controllers/` (awards, milestone schedules,
evidence, verification, disbursement intents) used `:orgId` while the
`scholarship-finance` and `scholarship-disbursement` controllers used `:organizationId`.
They now use `:organizationId`, and their guard scope resolves the same key.

## Impact

- **API:** none for callers. The URL is positional, so `/organizations/<id>/scholarships/...`
  is unchanged. Only the generated OpenAPI parameter name changes from `orgId` to
  `organizationId`.
- **Migration:** a client generated from the OpenAPI document should be regenerated if it
  exposes the parameter name. Hand-written clients are unaffected. No data migration.
- **Privacy / tenancy:** no change to who may call what. The guard still resolves the
  organization from the path before any handler runs.
- **Operations:** none.

## Not covered

Some handlers still accept the organization through a query string or a request body
rather than the path. Moving them onto the path is a breaking API change and is left for a
separate, versioned migration.
