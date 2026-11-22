import { Injectable } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';

/**
 * Deny-by-default authorization for conflict checks (MENTOR-040).
 *
 * Staff may inspect, request and decide waivers (a different staff member
 * from the requester must decide). Participants may check and explain only
 * their own proposal and never see private free text.
 */
@Injectable()
export class ConflictAccessPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  isStaff(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN || user.role === Role.MODERATOR;
  }

  isParticipant(user: MentorshipUser, record: { mentorId: string; menteeId: string }): boolean {
    return (
      (user.id === record.mentorId && user.role === Role.TUTOR) ||
      (user.id === record.menteeId && user.role === Role.STUDENT)
    );
  }

  assertCanCheck(user: MentorshipUser, mentorId: string, menteeId: string): void {
    if (this.isStaff(user) || this.isParticipant(user, { mentorId, menteeId })) return;
    this.deny('run_conflict_check');
  }

  assertCanExplain(user: MentorshipUser, record: { mentorId: string; menteeId: string }): void {
    if (this.isStaff(user) || this.isParticipant(user, record)) return;
    this.deny('explain_conflict_check');
  }

  assertCanDecide(user: MentorshipUser): void {
    if (!this.isStaff(user)) this.deny('decide_conflict_waiver');
  }

  deny(reason: string): never {
    try {
      this.telemetry.count('mentorship_authz_denied_total', { reason });
    } catch {
      // Telemetry must never change the authorization decision.
    }
    throw new ForbiddenDomainException(
      'MENTOR_ACCESS_DENIED: not permitted for this conflict resource',
      ErrorCode.MENTOR_ACCESS_DENIED,
    );
  }
}
