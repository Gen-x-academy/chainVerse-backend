import { OrganizationRole } from '../../common/enums/organization-role.enum';

/** Organization roles that administer scholarship money. */
export const STAFF = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

/** Any member — recipients act on their own wallet and payments. */
export const ALL_MEMBERS = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.INSTRUCTOR,
  OrganizationRole.MEMBER,
] as const;

export function isStaff(role: OrganizationRole | undefined): boolean {
  return role === OrganizationRole.OWNER || role === OrganizationRole.ADMIN;
}
