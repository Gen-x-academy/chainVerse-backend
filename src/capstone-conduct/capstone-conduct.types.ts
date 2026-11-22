/**
 * Domain types for capstone code-of-conduct enforcement (CAPSTONE-055).
 *
 *  - *Record = stored, full fidelity
 *  - *View   = returned to callers, minimised
 *  - Breach references are restricted: only opaque case ids are stored — never
 *    narrative text, evidence, or reporter identity.
 */

/** Platform roles allowed to administer policies and breach references. */
export const CONDUCT_ADMIN_ROLES = ['admin', 'moderator'] as const;

/** Capstone tracks a conduct policy may apply to. */
export enum ConductTrack {
  CAPSTONE = 'capstone',
  RESEARCH = 'research',
}

/** Lifecycle of a published policy version. */
export enum ConductPolicyStatus {
  /** The only version users must acknowledge for the tracks it covers. */
  CURRENT = 'current',
  /** Replaced by a later version; acknowledgements of it no longer satisfy enforcement if re-acknowledgement was required. */
  SUPERSEDED = 'superseded',
}

/** Acknowledgement standing of a user for one track. */
export enum ConductStanding {
  NOT_ACKNOWLEDGED = 'not_acknowledged',
  CURRENT = 'current',
  REACKNOWLEDGEMENT_REQUIRED = 'reacknowledgement_required',
}

export enum BreachSeverity {
  MINOR = 'minor',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export enum BreachStatus {
  RECORDED = 'recorded',
  UNDER_REVIEW = 'under_review',
  UPHELD = 'upheld',
  DISMISSED = 'dismissed',
}

export const ALLOWED_BREACH_TRANSITIONS: Record<
  BreachStatus,
  readonly BreachStatus[]
> = {
  [BreachStatus.RECORDED]: [BreachStatus.UNDER_REVIEW, BreachStatus.DISMISSED],
  [BreachStatus.UNDER_REVIEW]: [BreachStatus.UPHELD, BreachStatus.DISMISSED],
  [BreachStatus.UPHELD]: [],
  [BreachStatus.DISMISSED]: [],
};

export interface ConductPolicyRecord {
  id: string;
  tenantId: string;
  /** Monotonic per tenant; first published version is 1. */
  version: number;
  title: string;
  /** SHA-256 of the policy text held by the content system. The text is never stored here. */
  contentDigest: string;
  tracks: ConductTrack[];
  /** When true, acknowledgements of earlier versions stop satisfying enforcement. */
  requiresReacknowledgement: boolean;
  status: ConductPolicyStatus;
  publishedBy: string;
  publishedAt: string;
  supersededAt: string | null;
}

export interface ConductAcknowledgementRecord {
  /** Deterministic: `${userId}:${track}:${policyVersion}` — makes duplicates structurally impossible. */
  id: string;
  tenantId: string;
  userId: string;
  track: ConductTrack;
  policyId: string;
  policyVersion: number;
  acknowledgedAt: string;
}

export interface BreachReferenceRecord {
  id: string;
  tenantId: string;
  /** Opaque id of the case in the restricted trust-and-safety system. */
  caseReference: string;
  subjectUserId: string;
  track: ConductTrack;
  policyVersion: number;
  severity: BreachSeverity;
  status: BreachStatus;
  recordedBy: string;
  recordedAt: string;
  updatedAt: string;
  resolvedBy: string | null;
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface ConductPolicyView {
  id: string;
  version: number;
  title: string;
  contentDigest: string;
  tracks: ConductTrack[];
  requiresReacknowledgement: boolean;
  status: ConductPolicyStatus;
  publishedAt: string;
}

export interface ConductAcknowledgementView {
  id: string;
  userId: string;
  track: ConductTrack;
  policyVersion: number;
  acknowledgedAt: string;
  /** True when this request created the acknowledgement; false when it already existed. */
  created: boolean;
}

export interface ConductStatusView {
  userId: string;
  track: ConductTrack;
  standing: ConductStanding;
  currentPolicyVersion: number | null;
  acknowledgedVersion: number | null;
  /** Whether the user may proceed with capstone activity on this track. */
  compliant: boolean;
}

export interface BreachReferenceView {
  id: string;
  caseReference: string;
  subjectUserId: string;
  track: ConductTrack;
  policyVersion: number;
  severity: BreachSeverity;
  status: BreachStatus;
  recordedAt: string;
  updatedAt: string;
}

// ── Actor / audit / ports ────────────────────────────────────────────────────

export interface ConductActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface ConductAuditEntry {
  id: string;
  action: string;
  tenantId: string;
  actorId: string;
  actorRoles: readonly string[];
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'denied' | 'failed';
  fingerprint: string;
  requestHash: string;
  timestamp: string;
}

/** Outbound notification port. Failures must never roll back a conduct decision. */
export interface ConductNotifier {
  reacknowledgementRequired(input: {
    tenantId: string;
    policyVersion: number;
    tracks: ConductTrack[];
  }): Promise<void>;
}

export const CONDUCT_NOTIFIER = Symbol('CONDUCT_NOTIFIER');
