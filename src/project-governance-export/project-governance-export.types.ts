/**
 * Domain types for project governance export (CAPSTONE-056).
 *
 *  - Governance ledger entries are append-only and carry opaque references and
 *    a short participant-visible label — never free-text reasons or identities.
 *  - Exports are participant-safe: user ids are replaced by project roles and a
 *    `byYou` marker.
 */

export const GOVERNANCE_ADMIN_ROLES = ['admin', 'moderator'] as const;

export enum GovernanceProjectRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

/** Roles allowed to append governance records (besides platform admins). */
export const GOVERNANCE_WRITE_ROLES: readonly GovernanceProjectRole[] = [
  GovernanceProjectRole.OWNER,
];

export enum GovernanceRecordKind {
  TERMS_ACCEPTANCE = 'terms_acceptance',
  AMENDMENT = 'amendment',
  APPROVAL = 'approval',
}

export enum ExportStatus {
  READY = 'ready',
  REVOKED = 'revoked',
}

export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_EXPORTS_PER_REQUESTER = 5;

export interface GovernanceProjectStub {
  id: string;
  tenantId: string;
  members: Record<string, GovernanceProjectRole>;
}

export interface GovernanceRecordEntry {
  id: string;
  tenantId: string;
  projectId: string;
  kind: GovernanceRecordKind;
  /** Opaque document/version reference, unique per project and kind. */
  reference: string;
  /** Terms or amendment this record builds on (amendments → terms, approvals → either). */
  targetReference: string | null;
  label: string;
  recordedBy: string;
  recordedAt: string;
}

export interface GovernanceExportRecord {
  id: string;
  tenantId: string;
  projectId: string;
  requesterId: string;
  status: ExportStatus;
  /** True when at least one section could not be produced. */
  partial: boolean;
  /** SHA-256 over the canonical content, so recipients can verify integrity. */
  contentDigest: string;
  /** Cleared on revocation. */
  content: GovernanceExportContent | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

// ── Export content (participant-safe) ───────────────────────────────────────

export interface ExportedGovernanceEntry {
  reference: string;
  targetReference: string | null;
  label: string;
  recordedAt: string;
  recordedByRole: GovernanceProjectRole | 'platform';
  byYou: boolean;
}

export type SectionResult<T> =
  | { available: true; data: T }
  | { available: false; reason: 'source_not_configured' | 'source_failed' };

export interface MembershipSummary {
  total: number;
  byRole: Partial<Record<GovernanceProjectRole, number>>;
  yourRole: GovernanceProjectRole | null;
}

export interface MilestoneSummary {
  total: number;
  byStatus: Record<string, number>;
  nextDueDate: string | null;
}

export interface FinancialSummary {
  currency: string;
  /** Aggregate minor units only; never per-recipient or per-payment detail. */
  budgetedMinor: number;
  reservedMinor: number;
  releasedMinor: number;
}

export interface GovernanceExportContent {
  projectId: string;
  generatedAt: string;
  acceptedTerms: ExportedGovernanceEntry[];
  amendments: ExportedGovernanceEntry[];
  approvals: ExportedGovernanceEntry[];
  membership: MembershipSummary;
  milestones: SectionResult<MilestoneSummary>;
  financials: SectionResult<FinancialSummary>;
}

export interface GovernanceExportView {
  id: string;
  projectId: string;
  status: ExportStatus;
  partial: boolean;
  contentDigest: string;
  createdAt: string;
  expiresAt: string;
}

export interface GovernanceExportDownload extends GovernanceExportView {
  content: GovernanceExportContent;
}

export interface GovernanceRecordView {
  id: string;
  projectId: string;
  kind: GovernanceRecordKind;
  reference: string;
  targetReference: string | null;
  label: string;
  recordedAt: string;
}

// ── Ports ────────────────────────────────────────────────────────────────────

/** Aggregate-only providers. A throwing provider yields an unavailable section, never a failed export. */
export interface GovernanceMilestoneSource {
  summarize(input: {
    tenantId: string;
    projectId: string;
    actor: GovernanceActor;
  }): Promise<MilestoneSummary>;
}
export interface GovernanceFinanceSource {
  summarize(input: {
    tenantId: string;
    projectId: string;
    actor: GovernanceActor;
  }): Promise<FinancialSummary>;
}

export const GOVERNANCE_MILESTONE_SOURCE = Symbol(
  'GOVERNANCE_MILESTONE_SOURCE',
);
export const GOVERNANCE_FINANCE_SOURCE = Symbol('GOVERNANCE_FINANCE_SOURCE');

export interface GovernanceActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface GovernanceAuditEntry {
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
