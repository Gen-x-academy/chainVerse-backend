import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '../enums/organization-role.enum';

export const ORG_ROLES_KEY = 'orgRoles';
export const ORG_SCOPE_KEY = 'orgScope';

/**
 * Declares which organization roles may invoke a handler. Any listed role is
 * sufficient (the guard does not imply a hierarchy — list roles explicitly so
 * each route's intent is readable at the call site).
 */
export const OrgRoles = (...roles: OrganizationRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);

export type OrgScopeSource = 'param' | 'body' | 'query' | 'membershipParam';

export interface OrgScopeOptions {
  /**
   * Where the organization is identified:
   *  - `param` / `body` / `query`: read the organization id from that location
   *  - `membershipParam`: the value is an OrganizationMember id; the guard
   *    loads that membership and scopes to its `organizationId`
   */
  source: OrgScopeSource;
  /** Property name to read from the chosen source. */
  key: string;
}

/**
 * Tells {@link OrganizationRolesGuard} how to find the organization a request
 * targets. Required on every handler that carries `@OrgRoles`.
 */
export const OrgScope = (options: OrgScopeOptions) =>
  SetMetadata(ORG_SCOPE_KEY, options);
