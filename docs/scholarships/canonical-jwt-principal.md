# Canonical JWT principal across scholarship modules

Closes #1250.

## The problem

`JwtAuthGuard` has always set **both** `sub` and `id` on `request.user`:

```ts
request.user = {
  sub: payload['sub'],
  id: payload['sub'],   // a copy
  email: payload['email'],
  role: payload['role'],
};
```

That duplication was not harmless. Consumers had to guess which field to read,
and the two drifted:

| Module | Declared | Read |
| --- | --- | --- |
| `scholarships` | — | `@CurrentUser('sub')` (46 uses) |
| `scholarship-disbursement` | — | `@CurrentUser('sub')` (6 uses) |
| `scholarship` | — | `@Actor()` → `user.sub ?? user.id` |
| `scholarship-finance` | `AuthenticatedUser { id }` | `req.user.id` (everywhere) |

`scholarship-finance/common/authenticated-user.ts` declared a principal with
**`id` only** — a type that cannot even express the `sub` value the other three
modules were reading. The same request therefore carried two incompatible
authenticated shapes, and TypeScript could not catch it because both shapes are
`string`.

## The contract

`src/common/auth/authenticated-principal.ts` is the one canonical definition:

```ts
interface AuthenticatedPrincipal {
  sub: string;   // the JWT `sub` claim — the canonical, stable subject id
  email: string;
  role: string;
  id: string;   // @deprecated alias for `sub`; do not add new uses
}
```

- **`sub` is the subject identifier.** It is what new code reads.
- **`id` is retained as a deprecated alias** so the ~60 existing imports keep
  compiling during the migration. It will be removed once nothing reads it.
- `AuthenticatedUser` in `scholarship-finance/common/authenticated-user.ts` is
  now a type alias for the canonical interface, so both names refer to one type
  rather than to two that can drift.

`isAuthenticatedPrincipal(value)` is the type guard guards use. It rejects a
missing `sub` outright, because "signed in but unidentifiable" must never fall
through to a permissive default.

## Actor classes

Authorization is reasoned about per actor class, because the trust each carries
is different:

| Source | Meaning | Trust |
| --- | --- | --- |
| `user` | a person with a valid access token | highest — a real identity behind the token |
| `organization` | an org-scoped machine credential | medium — bounded to one tenant |
| `automation` | a scheduler / integration token | lowest — no human in the loop |
| `service` | an internal service-to-service caller | bounded to an explicit allow-list |

Reading `sub` alone is never sufficient to distinguish a student from an
automation token with the same shape.

## What changed

| File | Change |
| --- | --- |
| `common/auth/authenticated-principal.ts` | **new** — the canonical type, `PrincipalSource`, `isAuthenticatedPrincipal` |
| `scholarship-finance/common/authenticated-user.ts` | re-exports the canonical type; `AuthenticatedUser` is now an alias |
| `scholarship-finance/guards/finance-access.guard.ts` | `FinanceRequest.user` now typed `{ sub?, role? }`; reads `user.sub` |
| `scholarship-finance/common/tenant-access.service.ts` | membership lookup uses `user.sub` |
| `scholarship-finance/receipts/receipts.service.ts` | `recipientId` comparison uses `user.sub` |
| `scholarship-finance/ledger/ledger.controller.ts` | passes `user.sub` |
| `scholarship-finance/payouts/payouts.controller.ts` | passes `user.sub` |
| `scholarship-finance/reconciliation/reconciliation.controller.ts` | `triggeredBy` uses `user.sub` |
| `scholarship-finance/programs/scholarship-program.controller.ts` | passes `user.sub` |
| `scholarship-finance/receipts/receipts.controller.ts` | passes `user.sub` |
| `scholarships/controllers/application-form.controller.ts` | `@Request() req` + `req.user.id` → `@CurrentUser('sub')` |
| `scholarship/scholarship-actor.ts` | reads `user.sub` first; adds `hasActor()` guard |

No behavioural change: `JwtAuthGuard` always set both fields to the same value,
so switching readers from `id` to `sub` cannot change an authorization outcome
on a correctly-formed token.

## Migration

Compile-time only. Because `id` and `sub` are always equal on a real token,
the swap is behaviour-preserving. Once no consumer reads `id`, the field can be
dropped from `JwtAuthGuard` and the alias removed — at which point a token
carrying a mismatched `id` becomes unrepresentable rather than merely ignored.

## Tests

`src/scholarship-finance/__tests__/authenticated-principal.spec.ts` covers:

- the canonical guard, including that a missing `sub` is a hard rejection;
- that `id` is optional (new code needs only `sub`);
- that every actor class named in the acceptance criteria exists;
- that the legacy `AuthenticatedUser` name still resolves to the canonical type,
  so the ~60 existing imports keep working.

## Operational impact

None at runtime. The change is a type-level unification plus a reader swap on
fields that already held the same value.

The one thing to watch: any code that constructs a principal by hand (a seed
script, a test fixture, a mock) and sets `id` but not `sub` will now fail
`isAuthenticatedPrincipal`. That is the intent — it surfaces the drift instead
of letting it through.
