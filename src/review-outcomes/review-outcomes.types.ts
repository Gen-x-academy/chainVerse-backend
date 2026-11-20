export enum ReviewOutcomeRole {
  SUBMITTER = 'submitter',
  REVIEWER = 'reviewer',
  COORDINATOR = 'coordinator',
  ADMIN = 'admin',
}

export enum ProposalStatus {
  IN_REVISION = 'in_revision',
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum DeliverableStatus {
  SUBMITTED = 'submitted',
  CHANGES_REQUESTED = 'changes_requested',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export type Operation =
  | 'register_proposal'
  | 'submit_review'
  | 'aggregate_outcomes'
  | 'request_revision'
  | 'respond_to_revision'
  | 'submit_deliverable'
  | 'review_deliverable'
  | 'list_audit';

export interface ActorContext {
  tenantId: string;
  actorId: string;
  roles: string[];
}

export interface AuditEntry {
  tenantId: string;
  actorId: string;
  action: string;
  entityId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ProposalRecord {
  proposalId: string;
  tenantId: string;
  version: number;
  ownerId: string;
  status: ProposalStatus;
  criteria: string[];
  privatePayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecord {
  reviewId: string;
  tenantId: string;
  proposalId: string;
  proposalVersion: number;
  reviewerId: string;
  scores: Record<string, number>;
  comment?: string;
  createdAt: string;
}

export interface OutcomeRecord {
  outcomeId: string;
  tenantId: string;
  proposalId: string;
  proposalVersion: number;
  outcome: string;
  aggregateScore: number | null;
  quorum: number;
  receivedReviews: number;
  missingReviews: number;
  calibrationPolicy: string;
  missingReviewPolicy: string;
  tieTreatment: string;
  scoreAdjustments: Array<Record<string, unknown>>;
  explanations: string[];
  computedAt: string;
}

export interface RevisionRequestRecord {
  revisionRequestId: string;
  tenantId: string;
  proposalId: string;
  proposalVersion: number;
  requesterId: string;
  deadline: string;
  instructions: string;
  status: 'pending' | 'answered' | 'expired';
  responseVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableRecord {
  deliverableId: string;
  tenantId: string;
  milestoneId: string;
  version: number;
  submitterId: string;
  kind: string;
  reference: string;
  checksum: string | null;
  requirementIds: string[];
  reviewerIds: string[];
  requiredApprovals: number;
  status: DeliverableStatus;
  acceptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableReviewRecord {
  reviewId: string;
  tenantId: string;
  deliverableId: string;
  deliverableVersion: number;
  reviewerId: string;
  decision: string;
  rubricScores: Record<string, number>;
  rationale: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  fingerprint: string;
  result: Record<string, unknown>;
  createdAt: string;
}
