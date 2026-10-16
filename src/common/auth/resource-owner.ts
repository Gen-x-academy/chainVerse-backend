import { ForbiddenException } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/** The authenticated caller, as derived from the verified JWT. */
export interface RequestActor {
  id: string;
  role: string;
}

/** Roles allowed to read or moderate records they do not personally own. */
const STAFF_ROLES: ReadonlySet<string> = new Set([Role.ADMIN, Role.MODERATOR]);

export function isStaff(actor: RequestActor | undefined): boolean {
  return !!actor && STAFF_ROLES.has(actor.role);
}

/**
 * Rejects any caller that is neither the record's owner nor staff.
 *
 * Ownership is always compared against the JWT subject — never against an
 * identifier taken from the path or body — so a valid token for account A
 * cannot reach a record belonging to account B.
 */
export function assertOwnerOrStaff(
  ownerId: string,
  actor: RequestActor | undefined,
  resource: string,
): void {
  if (!actor?.id) {
    throw new ForbiddenException('Authenticated user could not be identified');
  }

  if (actor.id === ownerId || isStaff(actor)) {
    return;
  }

  throw new ForbiddenException(
    `You can only access your own ${resource} records`,
  );
}

/** Same rule as {@link assertOwnerOrStaff}, but staff get no exemption. */
export function assertOwner(
  ownerId: string,
  actor: RequestActor | undefined,
  resource: string,
): void {
  if (!actor?.id) {
    throw new ForbiddenException('Authenticated user could not be identified');
  }

  if (actor.id !== ownerId) {
    throw new ForbiddenException(
      `You can only modify your own ${resource} records`,
    );
  }
}
