/**
 * @file
 * Backwards-compatible alias for the canonical authenticated principal.
 *
 * The canonical definition lives in
 * [`src/common/auth/authenticated-principal.ts`](../../auth/authenticated-principal.ts).
 * It is re-exported here so that the ~60 existing imports of
 * `scholarship-finance/common/authenticated-user` keep working while the
 * codebase migrates to reading `sub`.
 *
 * **Read `sub`, not `id`.** `id` is a deprecated alias for `sub` and will be
 * removed. See the canonical file for the full contract and the actor-class
 * table.
 */
import {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
  PrincipalSource,
  isAuthenticatedPrincipal,
} from '../../common/auth/authenticated-principal';

export type AuthenticatedUser = AuthenticatedPrincipal;
export type { AuthenticatedRequest, PrincipalSource };
export { isAuthenticatedPrincipal };
