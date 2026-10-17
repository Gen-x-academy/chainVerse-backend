import { Role } from '../common/enums/role.enum';

/** Which side of a match a participant is on. */
export enum ParticipantRole {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

/** Who opened a proposal. */
export enum InitiatorKind {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  COORDINATOR = 'coordinator',
  SYSTEM = 'system',
}

/**
 * Proposal lifecycle.
 *
 *   pending ──approve(all)──▶ activating ──▶ accepted
 *      │                          │
 *      │                          └─(failure / crash recovery)─▶ pending
 *      ├──reject──▶ rejected
 *      ├──withdraw──▶ withdrawn
 *      ├──expiresAt passed──▶ expired
 *      └──coordinator reassignment──▶ superseded
 */
export enum ProposalStatus {
  PENDING = 'pending',
  ACTIVATING = 'activating',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
  SUPERSEDED = 'superseded',
}

/** Statuses that hold the "one live proposal per pair+program" slot. */
export const OPEN_PROPOSAL_STATUSES = [
  ProposalStatus.PENDING,
  ProposalStatus.ACTIVATING,
] as const;

export enum EngagementStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
}

/**
 * Checks no one — coordinators included — can bypass. A failure here always
 * rejects the request.
 */
export enum HardCheck {
  SELF_MATCH = 'self_match',
  MENTOR_PROFILE_MISSING = 'mentor_profile_missing',
  MENTEE_PROFILE_MISSING = 'mentee_profile_missing',
  MENTOR_INELIGIBLE = 'mentor_ineligible',
  MENTEE_INELIGIBLE = 'mentee_ineligible',
  MENTOR_NOT_IN_PROGRAM = 'mentor_not_in_program',
  MENTEE_NOT_IN_PROGRAM = 'mentee_not_in_program',
  BLOCKED = 'blocked',
  ALREADY_ENGAGED = 'already_engaged',
  MENTOR_AT_CAPACITY = 'mentor_at_capacity',
}

/**
 * Preference checks. Participants cannot proceed when one fails; an
 * authorised coordinator may override with a recorded reason, and every
 * override is reportable.
 */
export enum SoftCheck {
  MENTOR_NOT_ACCEPTING = 'mentor_not_accepting',
  NO_SHARED_FOCUS_AREA = 'no_shared_focus_area',
}

/** Roles allowed to act as mentorship coordinators. */
export const MENTORSHIP_COORDINATOR_ROLES: Role[] = [Role.ADMIN, Role.MODERATOR];

/** Platform role each participant side must hold. */
export const PARTICIPANT_PLATFORM_ROLE: Record<ParticipantRole, Role> = {
  [ParticipantRole.MENTOR]: Role.TUTOR,
  [ParticipantRole.MENTEE]: Role.STUDENT,
};

/** Activations stuck longer than this are recovered by the sweeper. */
export const ACTIVATION_STALE_AFTER_MS = 2 * 60 * 1000;

/** Upper bound of documents a single sweep touches per phase. */
export const SWEEP_BATCH_SIZE = 500;

export const pairKey = (
  mentorId: string,
  menteeId: string,
  programId: string,
): string => `${mentorId}:${menteeId}:${programId}`;
