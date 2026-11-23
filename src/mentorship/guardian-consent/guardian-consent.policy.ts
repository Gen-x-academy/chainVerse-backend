import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ForbiddenDomainException,
} from '../../common/errors';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';

/**
 * Deny-by-default authorization for guardian consent decisions.
 *
 * A minor is never allowed to act as their own guardian. Admin/moderator
 * coordinators get explicitly scoped inspection powers only.
 */
@Injectable()
export class GuardianConsentPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  isAdmin(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN;
  }

  isCoordinator(user: MentorshipUser): boolean {
    return this.isAdmin(user) || user.role === Role.MODERATOR;
  }

  assertGuardianActor(user: MentorshipUser, minorId: string): void {
    if (user.id === minorId) {
      this.deny('self_guardian_action', 'GUARDIAN_SELF_ACTION_DENIED');
    }
  }

  assertCanInvite(user: MentorshipUser, minorId: string): void {
    if (user.id !== minorId && !this.isCoordinator(user)) {
      this.deny('invite_guardian', 'GUARDIAN_INVITE_DENIED');
    }
  }

  assertCanInspect(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) {
      this.deny('inspect_guardian_consent', 'GUARDIAN_INSPECT_DENIED');
    }
  }

  deny(reason: string, message = 'MENTOR_ACCESS_DENIED'): never {
    try {
      this.telemetry.count('mentorship_guardian_consent_denied_total', {
        reason,
      });
    } catch {
      // Telemetry must never turn a denial into a server error.
    }
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }
}
