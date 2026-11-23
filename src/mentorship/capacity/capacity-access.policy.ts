import { Injectable } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';

/**
 * Deny-by-default authorization for the capacity feature (MENTOR-041).
 *
 * Admins/moderators are the only actors allowed to define policies, inspect a
 * mentor's calculation or run the sweeper. Inspectors are read-only: policy
 * limits are applied to everyone, including admins, when reserving capacity.
 */
@Injectable()
export class CapacityAccessPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  isCoordinator(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN || user.role === Role.MODERATOR;
  }

  assertCanManagePolicy(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) this.deny('define_capacity_policy');
  }

  assertCanInspect(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) this.deny('inspect_capacity');
  }

  assertCanSweep(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) this.deny('sweep_capacity_reservations');
  }

  /** A tutor may reserve only for themselves; staff may act on behalf of a mentor. */
  assertCanActForMentor(user: MentorshipUser, mentorId: string): void {
    if (this.isCoordinator(user)) return;
    if (user.id === mentorId && user.role === Role.TUTOR) return;
    this.deny('reserve_capacity_for_other_mentor');
  }

  deny(reason: string): never {
    try {
      this.telemetry.count('mentorship_authz_denied_total', { reason });
    } catch {
      // Telemetry must never change the authorization decision.
    }
    throw new ForbiddenDomainException(
      'MENTOR_ACCESS_DENIED: not permitted for this capacity resource',
      ErrorCode.MENTOR_ACCESS_DENIED,
    );
  }
}
