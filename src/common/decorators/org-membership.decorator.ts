import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ResolvedOrgMembership } from '../guards/organization-roles.guard';

/**
 * Injects the membership resolved by `OrganizationRolesGuard`.
 *
 * Only meaningful on handlers guarded by `OrganizationRolesGuard`; elsewhere it
 * resolves to `undefined`.
 */
export const OrgMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedOrgMembership | undefined =>
    ctx.switchToHttp().getRequest()?.organizationMembership,
);
