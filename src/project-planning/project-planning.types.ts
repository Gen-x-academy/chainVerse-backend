export const PLATFORM_PLANNING_ROLES = ['admin', 'moderator', 'tutor'] as const;

export enum PlanningRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  VIEWER = 'viewer',
  APPROVER = 'approver',
}

export enum RiskSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RiskLikelihood {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ExtensionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface PlanningActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  deadline: string;
  members: Record<string, PlanningRole>;
  createdAt: string;
}

export interface ObjectiveRecord {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  createdAt: string;
}

export interface CheckInRecord {
  id: string;
  tenantId: string;
  objectiveId: string;
  sequence: number;
  percentage: number;
  note?: string;
  regressionReason?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface RiskRecord {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  severity: RiskSeverity;
  likelihood: RiskLikelihood;
  raisedBy: string;
  raisedAt: string;
  mitigation?: {
    ownerId: string;
    plan: string;
    addedBy: string;
    addedAt: string;
  };
}

export interface PhaseRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface ExtensionRequestRecord {
  id: string;
  tenantId: string;
  projectId: string;
  requesterId: string;
  baseDeadline: string;
  requestedDays: number;
  reason: string;
  status: ExtensionStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  requestedAt: string;
}

export interface ProjectView {
  id: string;
  name: string;
  deadline: string;
  createdAt: string;
}

export interface ObjectiveView {
  id: string;
  projectId: string;
  title: string;
  currentPercentage: number;
  createdAt: string;
}

export interface CheckInView {
  id: string;
  objectiveId: string;
  percentage: number;
  regression: boolean;
  hasNote: boolean;
  hasRegressionReason: boolean;
  recordedBy: string;
  recordedAt: string;
}

export interface RiskView {
  id: string;
  projectId: string;
  title: string;
  severity: RiskSeverity;
  likelihood: RiskLikelihood;
  hasMitigation: boolean;
  mitigationOwnerId?: string;
  raisedBy: string;
  raisedAt: string;
}

export interface PhaseView {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface ExtensionView {
  id: string;
  projectId: string;
  requesterId: string;
  requestedDays: number;
  baseDeadline: string;
  hasReason: boolean;
  hasDecisionNote: boolean;
  status: ExtensionStatus;
  effectiveDeadline?: string;
  decidedBy?: string;
  decidedAt?: string;
  requestedAt: string;
}

export interface PlanningAuditEntry {
  id: string;
  action: string;
  tenantId: string;
  actorId: string;
  actorRoles: readonly string[];
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'denied';
  fingerprint: string;
  requestHash: string;
  timestamp: string;
}
