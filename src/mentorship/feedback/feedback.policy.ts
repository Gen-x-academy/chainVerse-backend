import { Injectable } from '@nestjs/common';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';

/** Deny-by-default authorization for feedback submission and reading. */
@Injectable()
export class FeedbackPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  isAdmin(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN;
  }

  isCoordinator(user: MentorshipUser): boolean {
    return this.isAdmin(user) || user.role === Role.MODERATOR;
  }

  assertCanSubmit(user: MentorshipUser): void {
    const participantRoles: string[] = [Role.STUDENT, Role.TUTOR];
    if (!participantRoles.includes(String(user.role)) && !this.isCoordinator(user)) {
      this.deny('submit_feedback', 'FEEDBACK_SUBMIT_DENIED');
    }
  }

  assertCanAggregate(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) {
      this.deny('aggregate_feedback', 'FEEDBACK_AGGREGATE_DENIED');
    }
  }

  assertCanReadFreeText(
    user: MentorshipUser,
    authorId: string,
    reason?: string,
  ): void {
    if (user.id === authorId) return;
    if (this.isAdmin(user) && reason?.trim()) return;
    this.deny('read_free_text', 'FEEDBACK_FREE_TEXT_DENIED');
  }

  deny(reason: string, message = 'MENTOR_ACCESS_DENIED'): never {
    try {
      this.telemetry.count('mentorship_feedback_denied_total', { reason });
    } catch {
      // Telemetry must never turn a denial into a server error.
    }
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }
}
