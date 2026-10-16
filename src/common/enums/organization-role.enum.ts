/**
 * Roles a principal can hold *inside* a single organization.
 *
 * These are orthogonal to the platform-wide {@link Role} enum: a user with the
 * global `student` role can be the `owner` of their own organization, and a
 * global `tutor` has no organization powers unless a membership grants them.
 */
export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  INSTRUCTOR = 'instructor',
  MEMBER = 'member',
}

/** Highest privilege first — index doubles as the precedence rank. */
export const ORGANIZATION_ROLE_HIERARCHY: readonly OrganizationRole[] = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.INSTRUCTOR,
  OrganizationRole.MEMBER,
];

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    typeof value === 'string' &&
    (ORGANIZATION_ROLE_HIERARCHY as readonly string[]).includes(value)
  );
}

/**
 * True when `role` is at least as privileged as `minimum`.
 * `owner` outranks `admin` outranks `instructor` outranks `member`.
 */
export function organizationRoleSatisfies(
  role: OrganizationRole,
  minimum: OrganizationRole,
): boolean {
  return (
    ORGANIZATION_ROLE_HIERARCHY.indexOf(role) <=
    ORGANIZATION_ROLE_HIERARCHY.indexOf(minimum)
  );
}
