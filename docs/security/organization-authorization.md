# Organization-scoped authorization

Global roles (`admin`, `moderator`, `tutor`, `student`) describe what someone is
on the platform. They cannot express what someone is *inside* a particular
organization. This adds a second, orthogonal axis.

Implementation: [`OrganizationRolesGuard`](../../src/common/guards/organization-roles.guard.ts),
[`OrganizationRole`](../../src/common/enums/organization-role.enum.ts),
[`@OrgRoles` / `@OrgScope`](../../src/common/decorators/org-roles.decorator.ts).

## Roles

| Role         | Intended for                                  |
| ------------ | --------------------------------------------- |
| `owner`      | Full control, including deleting the org      |
| `admin`      | Manage members and org settings               |
| `instructor` | Teach within the org; read the member list    |
| `member`     | Belong to the org; read the member list       |

A membership is a row in `organization_members` pairing a `userId` with an
`organizationId` and one of these roles. The schema constrains `role` to the
enum, so a membership can never carry a value the guard would have to guess at.

## How enforcement works

A handler declares the roles it accepts and where the organization is found:

```ts
@Patch(':id')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'id' })
@OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) { … }
```

`@OrgScope.source` may be:

| Source            | Resolution                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `param`           | Read the organization id from a route parameter                   |
| `body`            | Read it from the request body                                     |
| `query`           | Read it from the query string                                     |
| `membershipParam` | The parameter is a membership id; scope to *its* `organizationId` |

`membershipParam` is what stops the obvious cross-tenant attack: without it, a
route like `PATCH /organization-members/:id` would let the owner of org B edit a
membership belonging to org A simply by knowing its id.

The guard then looks up the caller's membership **in that specific
organization**. Holding `owner` in another organization grants nothing. Every
guarded route fails closed:

- no `@OrgScope` on a guarded handler → 500 (misconfiguration, not a pass)
- unauthenticated → 401
- organization not resolvable → 403
- no membership in that organization → 403
- membership whose role is not listed → 403

On success the resolved membership is attached to the request and readable via
`@OrgMembership()`.

## Route matrix

### `/organizations`

| Route                | Required                                    |
| -------------------- | ------------------------------------------- |
| `GET /`              | public                                      |
| `GET /:id`           | public                                      |
| `POST /`             | any authenticated user; creator becomes `owner` |
| `PATCH /:id`         | org `owner` or `admin`                      |
| `DELETE /:id`        | org `owner`                                 |

### `/organization-members`

| Route                          | Required                                        |
| ------------------------------ | ----------------------------------------------- |
| `GET /organization/:orgId`     | any member of that organization                 |
| `GET /user/:userId`            | yourself only (platform `admin` may query any)  |
| `GET /:id`                     | any member of the membership's organization     |
| `POST /`                       | org `owner` or `admin` of the target org        |
| `PATCH /:id`                   | org `owner` or `admin` of the membership's org  |
| `DELETE /:id`                  | org `owner` or `admin` of the membership's org  |

### Breaking changes

- `POST /organizations` previously required the platform `admin` role. It is now
  open to any authenticated user, who becomes the organization's `owner`. This
  is what gives every later org-scoped check a principal to match; without it,
  only platform admins could ever create an organization and no one would hold
  an org role.
- `PATCH`/`DELETE /organizations/:id` and all `/organization-members` mutations
  previously required the platform `admin` role. They now require an
  organization role. Platform admins retain access through the break-glass path
  below, so existing admin tooling keeps working.
- `GET /organization-members/user/:userId` previously let any authenticated user
  enumerate anyone's memberships. It is now restricted to the caller's own id.
- `GET /organization-members/organization/:orgId` and `GET /:id` previously
  needed only authentication. They now require membership in that organization.
- `role` is validated against the enum. Requests sending an arbitrary role
  string now get 400 instead of persisting an unrecognised value.

## Ownership rules

Enforced in `OrganizationMemberService` on top of the guard:

- Only an `owner` may grant or revoke the `owner` role. An org `admin` cannot
  promote themselves.
- Only an `owner` may remove another `owner`.
- The last remaining `owner` cannot be demoted or removed, so an organization is
  never left without an administrator.

## Platform admin break-glass

A platform `admin` with no membership may act on any organization, so support
staff can administer any tenant. The path is deliberately narrow and visible:

- It does **not** extend to `moderator` or any other global role.
- When an admin *does* hold a real membership, that membership's role is used
  instead of the bypass.
- The resolved membership carries `viaPlatformAdmin: true`, and the resulting
  mutation is recorded in the audit trail (see
  [audit-logging.md](./audit-logging.md)).

## Auditing

Organization mutations are audited: `organization.created`,
`organization.updated`, `organization.deleted`, `organization_member.added`,
`organization_member.role_changed`, `organization_member.removed`.

Deleting an organization also deletes its memberships, so a recreated id cannot
inherit stale grants.

## Tests

- `src/common/guards/organization-roles.guard.spec.ts` — 17 cases including
  cross-organization denial through `param`, `body` and `membershipParam`
  scopes, fail-closed misconfiguration, and the limits of the admin bypass
- `src/organization-member/organization-member.service.spec.ts` — ownership
  transfer rules, last-owner protection, membership enumeration
- `src/common/enums/organization-role.enum.spec.ts` — role hierarchy
