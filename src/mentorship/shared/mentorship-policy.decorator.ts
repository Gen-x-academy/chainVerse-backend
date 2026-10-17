import { SetMetadata } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

export const MENTORSHIP_POLICY_KEY = 'mentorship:policy';

export interface MentorshipPolicyMetadata {
  /** Stable action name, used for audit and telemetry labels. */
  action: string;
  /** Platform roles allowed to reach the handler at all. Resource scoping happens in the service. */
  roles: Role[];
}

/**
 * Declares who may call a mentorship endpoint.
 *
 * MentorshipAuthGuard is deny-by-default: a handler without this decorator
 * is rejected with MENTOR_POLICY_MISSING, so new routes cannot become public
 * by accident.
 */
export const MentorshipPolicy = (action: string, roles: Role[]) =>
  SetMetadata(MENTORSHIP_POLICY_KEY, { action, roles } satisfies MentorshipPolicyMetadata);

/** Every authenticated platform role. Use only for applicant-facing reads. */
export const ANY_ROLE: Role[] = [Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT];

/** Roles that may be scoped as reviewers or program owners. */
export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MODERATOR, Role.TUTOR];
