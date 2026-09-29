import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuditContext,
  resolveAuditContext,
} from '../common/audit/audit-context';
import { isAuthenticatedPrincipal } from '../common/auth/authenticated-principal';
import type { RequestWithOrgMembership } from '../common/guards/organization-roles.guard';
import { OrganizationRole } from '../common/enums/organization-role.enum';

/** Everything a scholarship service needs to know about the caller. */
export interface ScholarshipActor {
  userId: string;
  platformRole: string | null;
  /** Set when `OrganizationRolesGuard` resolved a membership for this route. */
  orgRole: OrganizationRole | null;
  viaPlatformAdmin: boolean;
  audit: AuditContext;
}

/**
 * Injects the {@link ScholarshipActor} for the current request.
 * Relies on `JwtAuthGuard` having populated `request.user`.
 *
 * The subject is read from the canonical `sub` field (#1250). The `id` fallback
 * is retained only so a principal set by older code still resolves; it is
 * dropped once nothing sets `id` any more.
 */
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScholarshipActor => {
    const request = ctx.switchToHttp().getRequest<
      RequestWithOrgMembership & {
        user?: { sub?: string; id?: string; role?: string };
      }
    >();
    const user = request.user ?? {};
    const membership = request.organizationMembership;
    return {
      userId: String(user.sub ?? user.id ?? ''),
      platformRole: user.role ?? null,
      orgRole: membership?.role ?? null,
      viaPlatformAdmin: membership?.viaPlatformAdmin ?? false,
      audit: resolveAuditContext(request),
    };
  },
);

/**
 * True when the request carries a usable authenticated principal.
 *
 * Used by routes that must distinguish "not signed in" from "signed in but
 * unidentifiable" — the second case must never fall through to a permissive
 * default.
 */
export function hasActor(request: unknown): boolean {
  if (!request || typeof request !== 'object') return false;
  return isAuthenticatedPrincipal(
    (request as { user?: unknown }).user,
  );
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}
