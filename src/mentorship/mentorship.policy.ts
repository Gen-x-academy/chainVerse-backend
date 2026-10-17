import { Types } from 'mongoose';
import type { AuditContext } from '../common/audit/audit-context';
import {
  HardCheck,
  MENTORSHIP_COORDINATOR_ROLES,
  ParticipantRole,
} from './mentorship.constants';
import type { MatchProposal } from './schemas/match-proposal.schema';
import type { MentorshipEngagement } from './schemas/mentorship-engagement.schema';

/** The authenticated caller, as every mentorship service method sees it. */
export interface MentorshipActor {
  userId: string;
  platformRole: string;
  audit: AuditContext;
}

export type ProposalRecord = MatchProposal & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type EngagementRecord = MentorshipEngagement & { _id: Types.ObjectId };

export function isCoordinator(platformRole: string): boolean {
  return MENTORSHIP_COORDINATOR_ROLES.some((role) => role === platformRole);
}

export function participantRoleOf(
  proposal: Pick<MatchProposal, 'mentorId' | 'menteeId'>,
  userId: string,
): ParticipantRole | null {
  if (proposal.mentorId === userId) return ParticipantRole.MENTOR;
  if (proposal.menteeId === userId) return ParticipantRole.MENTEE;
  return null;
}

/**
 * Field-level visibility for proposals.
 *
 * Participants see the match, terms, compatibility reasons, approval state
 * and the coordinator's public reason. Coordinator internal notes, override
 * details and the full reason history are coordinator-only.
 */
export function toProposalView(
  proposal: ProposalRecord,
  viewer: { coordinator: boolean },
) {
  const base = {
    id: proposal._id.toString(),
    mentorId: proposal.mentorId,
    menteeId: proposal.menteeId,
    programId: proposal.programId,
    status: proposal.status,
    compatibilityReasons: proposal.compatibilityReasons,
    terms: proposal.terms,
    termsVersion: proposal.termsVersion,
    termsHash: proposal.termsHash,
    expiresAt: proposal.expiresAt,
    initiator: { kind: proposal.initiator.kind },
    note: proposal.initiatorNote,
    requiredApprovals: proposal.requiredApprovals,
    approvals: proposal.approvals
      .filter((a) => a.termsVersion === proposal.termsVersion)
      .map((a) => ({
        participantRole: a.participantRole,
        termsVersion: a.termsVersion,
        approvedAt: a.approvedAt,
      })),
    coordinatorAssisted: proposal.coordinator !== null,
    coordinator: proposal.coordinator
      ? {
          coordinatorId: proposal.coordinator.coordinatorId,
          reason: proposal.coordinator.reason,
        }
      : null,
    engagementId: proposal.engagementId,
    supersedesProposalId: proposal.supersedesProposalId,
    supersededByProposalId: proposal.supersededByProposalId,
    closedReason: proposal.closedReason,
    closedAt: proposal.closedAt,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };

  if (!viewer.coordinator) return base;

  return {
    ...base,
    initiator: proposal.initiator,
    coordinator: proposal.coordinator,
    overrides: proposal.overrides,
    capacityReserved: proposal.capacityReserved,
    closedBy: proposal.closedBy,
    history: proposal.history,
  };
}

export function toEngagementView(engagement: EngagementRecord) {
  return {
    id: engagement._id.toString(),
    proposalId: engagement.proposalId,
    mentorId: engagement.mentorId,
    menteeId: engagement.menteeId,
    programId: engagement.programId,
    terms: engagement.terms,
    termsVersion: engagement.termsVersion,
    termsHash: engagement.termsHash,
    status: engagement.status,
    coordinatorAssisted: engagement.coordinatorAssisted,
    activatedAt: engagement.activatedAt,
  };
}

/**
 * Participants learn which checks failed on their own side, but not the
 * counterpart's private eligibility state. Blocks are reported separately
 * and generically. Coordinators see everything.
 */
export function redactChecksForParticipant(
  checks: HardCheck[],
  side: ParticipantRole,
): string[] {
  const counterpartPrivate: Record<ParticipantRole, HardCheck[]> = {
    [ParticipantRole.MENTOR]: [
      HardCheck.MENTEE_INELIGIBLE,
      HardCheck.MENTEE_PROFILE_MISSING,
      HardCheck.MENTEE_NOT_IN_PROGRAM,
    ],
    [ParticipantRole.MENTEE]: [
      HardCheck.MENTOR_INELIGIBLE,
      HardCheck.MENTOR_PROFILE_MISSING,
    ],
  };
  const hidden = counterpartPrivate[side];
  const visible = new Set<string>();
  for (const check of checks) {
    if (check === HardCheck.BLOCKED) continue;
    visible.add(hidden.includes(check) ? 'counterpart_unavailable' : check);
  }
  return [...visible];
}
