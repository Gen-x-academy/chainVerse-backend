/**
 * The one canonical authenticated-principal shape for the whole backend (#1250).
 *
 * ## Why this exists
 *
 * `JwtAuthGuard` has always set **both** `sub` and `id` on `request.user`, with
 * `id` being a copy of `sub`. That duplication was not harmless: consumers had to
 * guess which field to read, and the two drifted. `scholarship-finance` declared a
 * principal with `id` only, while `scholarships` and `scholarship-disbursement`
 * read `sub` via `@CurrentUser('sub')`. The same request therefore had two
 * incompatible authenticated shapes, and a type that omits `sub` cannot even
 * express the value the other modules were reading.
 *
 * ## Contract
 *
 *   - `sub` is **the** subject identifier. It is the JWT `sub` claim, it is
 *     stable, and it is the only field new code should read.
 *   - `email` and `role` are carried for authorization decisions.
 *   - `id` is retained as a **deprecated alias** for `sub` so that code written
 *     before this change keeps compiling. It will be removed once no consumer
 *     reads it; do not add new uses.
 *
 * ## Actor classes
 *
 * `PrincipalSource` names *how* the principal authenticated. The acceptance
 * criteria for #1250 require that authorization is reasoned about per actor
 * class, because the trust each one carries is different:
 *
 *   | Source     | Meaning | Trust |
 *   | --- | --- | --- |
 *   | `user` | a person with a valid access token | highest — a real identity behind the token |
 *   | `organization` | an org-scoped machine credential | medium — bounded to one tenant |
 *   | `automation` | a scheduler / integration token | lowest — no human in the loop |
 *   | `service` | an internal service-to-service caller | bounded to an explicit allow-list |
 *
 * Every guard and controller reads `sub` and, where a decision depends on *who*
 * is calling, also `principalSource`. Reading `sub` alone is never sufficient to
 * distinguish a student from an automation token with the same shape.
 */
export interface AuthenticatedPrincipal {
  /** JWT `sub` claim. The canonical, stable subject identifier. */
  sub: string;
  email: string;
  role: string;
  /**
   * @deprecated Alias for `sub`, kept so pre-#1250 code keeps compiling.
   *             Read `sub` instead. Will be removed.
   */
  id: string;
}

/** How the caller authenticated. Drives authorization decisions. */
export enum PrincipalSource {
  /** A person presenting a valid access token. */
  USER = 'user',
  /** An organization-scoped machine credential. */
  ORGANIZATION = 'organization',
  /** A scheduler or integration token with no human in the loop. */
  AUTOMATION = 'automation',
  /** An internal service-to-service caller. */
  SERVICE = 'service',
}

/** Request carrying an authenticated principal. */
export interface AuthenticatedRequest {
  user: AuthenticatedPrincipal;
}

/**
 * Type guard: is `value` an authenticated principal we can authorize?
 *
 * Guards use this rather than a bare truthiness check on `user`, because a
 * missing `sub` is the difference between "not signed in" and "signed in as
 * someone we cannot identify" — and the second must never fall through to a
 * permissive default.
 */
export function isAuthenticatedPrincipal(
  value: unknown,
): value is AuthenticatedPrincipal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthenticatedPrincipal>;
  return (
    typeof candidate.sub === 'string' &&
    candidate.sub.length > 0 &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string'
  );
}
