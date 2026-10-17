/**
 * Mentorship event payloads. Ids only — consumers (notifications, the
 * payments track) load whatever they are permitted to see.
 */
export interface MentorshipProposalEventPayload {
  proposalId: string;
  mentorId: string;
  menteeId: string;
  programId: string;
  termsVersion: number;
  initiatorKind: string;
  coordinatorId: string | null;
  occurredAt: Date;
}

export interface MentorshipProposalClosedPayload
  extends MentorshipProposalEventPayload {
  status: string;
  closedBy: string;
}

export interface MentorshipEngagementActivatedPayload {
  engagementId: string;
  proposalId: string;
  mentorId: string;
  menteeId: string;
  programId: string;
  termsHash: string;
  coordinatorAssisted: boolean;
  occurredAt: Date;
}
