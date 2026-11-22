import { Injectable } from '@nestjs/common';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { ApprovalRole, Agreement } from './schemas/agreement.schema';

/** Deny-by-default authorization for agreement creation and approvals. */
@Injectable()
export class AgreementPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  isAdmin(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN;
  }

  isCoordinator(user: MentorshipUser): boolean {
    return this.isAdmin(user) || user.role === Role.MODERATOR;
  }

  isParticipant(
    user: MentorshipUser,
    agreement: Pick<Agreement, 'mentorId' | 'menteeId'>,
  ): boolean {
    return user.id === agreement.mentorId || user.id === agreement.menteeId;
  }

  assertCanCreate(
    user: MentorshipUser,
    mentorId: string,
    menteeId: string,
  ): void {
    if (
      user.id !== mentorId &&
      user.id !== menteeId &&
      !this.isCoordinator(user)
    ) {
      this.deny('create_for_other', 'AGREEMENT_CREATE_DENIED');
    }
    if (mentorId === menteeId) {
      this.deny('self_agreement', 'AGREEMENT_SELF_MATCH_DENIED');
    }
  }

  assertCanApprove(
    user: MentorshipUser,
    agreement: Agreement,
    role: ApprovalRole,
  ): void {
    if (role === ApprovalRole.MENTOR && user.id !== agreement.mentorId) {
      this.deny('approve_as_mentor', 'AGREEMENT_APPROVAL_DENIED');
    }
    if (role === ApprovalRole.MENTEE && user.id !== agreement.menteeId) {
      this.deny('approve_as_mentee', 'AGREEMENT_APPROVAL_DENIED');
    }
    if (role === ApprovalRole.COORDINATOR && !this.isCoordinator(user)) {
      this.deny('approve_as_coordinator', 'AGREEMENT_APPROVAL_DENIED');
    }
  }

  assertCanInspect(user: MentorshipUser): void {
    if (!this.isCoordinator(user)) {
      this.deny('inspect_agreement', 'AGREEMENT_INSPECT_DENIED');
    }
  }

  deny(reason: string, message = 'MENTOR_ACCESS_DENIED'): never {
    try {
      this.telemetry.count('mentorship_agreement_denied_total', { reason });
    } catch {
      // Telemetry must never turn a denial into a server error.
    }
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }
}
