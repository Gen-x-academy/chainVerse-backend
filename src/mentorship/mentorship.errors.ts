import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * Domain error for mentorship. Like DomainException it carries a stable
 * `errorCode`, and it may add non-sensitive `details` (e.g. failed checks)
 * that the global filter passes through.
 */
export class MentorshipException extends HttpException {
  readonly errorCode: ErrorCode;

  constructor(
    message: string,
    status: HttpStatus,
    errorCode: ErrorCode,
    details?: Record<string, unknown>,
  ) {
    super({ message, errorCode, ...(details && { details }) }, status);
    this.errorCode = errorCode;
  }
}

export const MentorshipErrors = {
  proposalNotFound: () =>
    new MentorshipException(
      'Match proposal not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.RES_MENTORSHIP_PROPOSAL_NOT_FOUND,
    ),

  profileNotFound: (kind: string) =>
    new MentorshipException(
      `No ${kind} mentorship profile exists for this user`,
      HttpStatus.NOT_FOUND,
      ErrorCode.RES_MENTORSHIP_PROFILE_NOT_FOUND,
      { kind },
    ),

  notParticipant: () =>
    new MentorshipException(
      'Only a participant whose approval this proposal requires can perform this action',
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_MENTORSHIP_NOT_PARTICIPANT,
    ),

  initiatorMismatch: (expectedField: string) =>
    new MentorshipException(
      `Participants may only propose matches that include themselves; set ${expectedField} to your own user id`,
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_MENTORSHIP_INITIATOR_MISMATCH,
      { field: expectedField },
    ),

  profileRoleMismatch: (kind: string, requiredRole: string) =>
    new MentorshipException(
      `A ${kind} profile requires the ${requiredRole} role`,
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      { kind, requiredRole },
    ),

  duplicateProposal: (existingProposalId?: string) =>
    new MentorshipException(
      'An open proposal already exists for this mentor, mentee and program',
      HttpStatus.CONFLICT,
      ErrorCode.BIZ_MENTORSHIP_DUPLICATE_PROPOSAL,
      existingProposalId ? { existingProposalId } : undefined,
    ),

  ineligible: (failedChecks: string[]) =>
    new MentorshipException(
      'The proposed match fails eligibility checks that cannot be overridden',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BIZ_MENTORSHIP_INELIGIBLE,
      { failedChecks },
    ),

  blocked: () =>
    new MentorshipException(
      'This match is not available',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BIZ_MENTORSHIP_BLOCKED,
    ),

  overrideRequired: (failedChecks: string[], coordinator: boolean) =>
    new MentorshipException(
      coordinator
        ? 'Soft checks failed; supply an override with a reason for each to proceed'
        : 'The match does not meet mentor preferences; a mentorship coordinator can review it',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BIZ_MENTORSHIP_OVERRIDE_REQUIRED,
      { failedChecks },
    ),

  overrideUnnecessary: (checks: string[]) =>
    new MentorshipException(
      'Overrides were supplied for checks that passed; remove them so override reports stay accurate',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BIZ_MENTORSHIP_OVERRIDE_UNNECESSARY,
      { checks },
    ),

  expired: () =>
    new MentorshipException(
      'This proposal has expired and can no longer be approved',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BIZ_MENTORSHIP_PROPOSAL_EXPIRED,
    ),

  notPending: (status: string) =>
    new MentorshipException(
      `This proposal is ${status} and can no longer change`,
      HttpStatus.CONFLICT,
      ErrorCode.BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING,
      { status },
    ),

  termsStale: (currentTermsVersion: number, currentTermsHash: string) =>
    new MentorshipException(
      'The terms changed since you reviewed them; fetch the proposal and reconfirm',
      HttpStatus.CONFLICT,
      ErrorCode.BIZ_MENTORSHIP_TERMS_STALE,
      { currentTermsVersion, currentTermsHash },
    ),

  capacityExhausted: () =>
    new MentorshipException(
      'The mentor has no remaining capacity',
      HttpStatus.CONFLICT,
      ErrorCode.BIZ_MENTORSHIP_CAPACITY_EXHAUSTED,
    ),

  alreadyEngaged: () =>
    new MentorshipException(
      'These participants already have an active engagement in this program',
      HttpStatus.CONFLICT,
      ErrorCode.BIZ_MENTORSHIP_ALREADY_ENGAGED,
    ),
};

export function isDuplicateKeyError(
  err: unknown,
  field?: string,
): err is { code: number; keyPattern?: Record<string, unknown> } {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e?.code !== 11000) return false;
  return field ? Boolean(e.keyPattern && field in e.keyPattern) : true;
}
