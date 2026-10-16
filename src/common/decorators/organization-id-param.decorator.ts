import { Param } from '@nestjs/common';
import { ParseObjectIdPipe } from '../pipes/parse-object-id.pipe';
import type { OrgScopeOptions } from './org-roles.decorator';

/**
 * The canonical name of the organization route parameter.
 *
 * Organization-scoped routes are written `organizations/:organizationId/...`, the
 * guards resolve the organization from this key, and the generated OpenAPI document
 * uses it. Do not introduce aliases such as `:orgId` or `:org`.
 */
export const ORGANIZATION_ID_PARAM = 'organizationId';

/** Reads and validates the organization id from the path. */
export const OrganizationIdParam = () =>
  Param(ORGANIZATION_ID_PARAM, new ParseObjectIdPipe());

/** Value for `@OrgScope(...)` on a route that carries the organization in its path. */
export const ORG_SCOPE_FROM_PATH: OrgScopeOptions = {
  source: 'param',
  key: ORGANIZATION_ID_PARAM,
};
