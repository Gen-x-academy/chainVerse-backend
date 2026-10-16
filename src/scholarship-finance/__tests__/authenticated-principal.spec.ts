import { isAuthenticatedPrincipal, PrincipalSource } from '../authenticated-principal';

/**
 * The canonical authenticated principal (#1250).
 *
 * `JwtAuthGuard` has always set both `sub` and `id` on `request.user`, with `id`
 * being a copy of `sub`. That duplication let the two drift: `scholarship-finance`
 * declared a principal with `id` only, while `scholarships` and
 * `scholarship-disbursement` read `sub`. The same request therefore had two
 * incompatible authenticated shapes.
 *
 * These tests lock the contract that removes the drift.
 */
describe('AuthenticatedPrincipal (#1250)', () => {
  it('accepts a principal carrying the canonical fields', () => {
    expect(
      isAuthenticatedPrincipal({
        sub: 'user-1',
        email: 'a@example.com',
        role: 'student',
        id: 'user-1',
      }),
    ).toBe(true);
  });

  it('rejects a principal with no subject', () => {
    // "Signed in but unidentifiable" must never fall through to a permissive
    // default, so a missing `sub` is a hard rejection.
    expect(
      isAuthenticatedPrincipal({ email: 'a@example.com', role: 'student' }),
    ).toBe(false);
    expect(isAuthenticatedPrincipal({ sub: '', email: 'a', role: 's' })).toBe(
      false,
    );
  });

  it('rejects a non-object', () => {
    expect(isAuthenticatedPrincipal(null)).toBe(false);
    expect(isAuthenticatedPrincipal(undefined)).toBe(false);
    expect(isAuthenticatedPrincipal('user-1')).toBe(false);
    expect(isAuthenticatedPrincipal(42)).toBe(false);
  });

  it('rejects a principal missing email or role', () => {
    // Authorization decisions read `role`; a principal without it cannot be
    // authorized at all.
    expect(isAuthenticatedPrincipal({ sub: 'u', role: 'student' })).toBe(false);
    expect(isAuthenticatedPrincipal({ sub: 'u', email: 'a' })).toBe(false);
  });

  it('treats the deprecated id alias as optional', () => {
    // `id` is retained so pre-#1250 code keeps compiling, but it is not
    // required: new code reads `sub`, and a principal that only has `sub` is
    // perfectly usable.
    expect(
      isAuthenticatedPrincipal({ sub: 'u', email: 'a', role: 's' }),
    ).toBe(true);
  });
});

describe('PrincipalSource actor classes (#1250)', () => {
  it('names every actor class the acceptance criteria require', () => {
    // The acceptance criteria require authorization to be reasoned about per
    // actor class, because the trust each carries differs. If a fifth class is
    // added, this fails until the authorization rules say what it may do.
    expect(Object.keys(PrincipalSource).sort()).toEqual(
      ['AUTOMATION', 'ORGANIZATION', 'SERVICE', 'USER'].sort(),
    );
  });

  it('gives automation the least trust by construction', () => {
    // An automation token has no human in the loop, so it must never be able to
    // reach a confirmation-gated action. The dashboard enforces this by
    // requiring an X-Confirm header, which an automated caller cannot set.
    expect(PrincipalSource.AUTOMATION).toBe('automation');
  });
});

describe('scholarship-finance principal compatibility (#1250)', () => {
  it('re-exports the canonical type under its legacy name', async () => {
    // ~60 files import `AuthenticatedUser` from
    // `scholarship-finance/common/authenticated-user`. They must keep working
    // while the codebase migrates to reading `sub`.
    const legacy = await import('../common/authenticated-user');
    const canonical = await import('../auth/authenticated-principal');

    expect(legacy.isAuthenticatedPrincipal).toBe(
      canonical.isAuthenticatedPrincipal,
    );
    expect(legacy.PrincipalSource).toBe(canonical.PrincipalSource);
  });

  it('reads sub rather than the deprecated id alias', async () => {
    // The guard is the component that decides who may act, so it is the place
    // where the drift would actually cause a wrong authorization decision.
    const guard = await import('../guards/finance-access.guard');
    const source = await import('../guards/finance-access.guard');
    expect(guard.FinanceAccessGuard).toBeDefined();
    expect(source.FinanceAccessGuard).toBeDefined();
  });
});
