/**
 * Domain types for project objectives and success criteria (CAPSTONE-057).
 *
 *  - *Record = stored, full fidelity
 *  - *View   = returned to callers, redacted by visibility and viewer role
 */

export const OBJECTIVES_ADMIN_ROLES = ['admin', 'moderator'] as const;

export enum ObjectiveProjectRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

/** Roles that may create and change objectives (besides platform admins). */
export const OBJECTIVE_MANAGE_ROLES: readonly ObjectiveProjectRole[] = [
  ObjectiveProjectRole.OWNER,
  ObjectiveProjectRole.PLANNER,
];

export enum ObjectivePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export const PRIORITY_ORDER: Record<ObjectivePriority, number> = {
  [ObjectivePriority.CRITICAL]: 0,
  [ObjectivePriority.HIGH]: 1,
  [ObjectivePriority.MEDIUM]: 2,
  [ObjectivePriority.LOW]: 3,
};

/** Whether success means the metric goes up or down. */
export enum ObjectiveDirection {
  INCREASE = 'increase',
  DECREASE = 'decrease',
}

/**
 * Who can see the objective's detail.
 *  - private: project owners/planners, the objective owner and platform admins
 *  - team:    every project member
 *  - public:  every authenticated user in the tenant (non-members get a minimal view)
 */
export enum ObjectiveVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
}

export enum ObjectiveStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ACHIEVED = 'achieved',
  ABANDONED = 'abandoned',
}

export const ALLOWED_OBJECTIVE_TRANSITIONS: Record<
  ObjectiveStatus,
  readonly ObjectiveStatus[]
> = {
  [ObjectiveStatus.DRAFT]: [ObjectiveStatus.ACTIVE, ObjectiveStatus.ABANDONED],
  [ObjectiveStatus.ACTIVE]: [
    ObjectiveStatus.ACHIEVED,
    ObjectiveStatus.ABANDONED,
  ],
  [ObjectiveStatus.ACHIEVED]: [],
  [ObjectiveStatus.ABANDONED]: [],
};

export interface SuccessCriterion {
  id: string;
  label: string;
  /** Value the metric must reach (>= when increasing, <= when decreasing). */
  threshold: number;
  /** Required criteria must be met before the objective can be achieved. */
  required: boolean;
}

export interface ObjectiveProjectStub {
  id: string;
  tenantId: string;
  members: Record<string, ObjectiveProjectRole>;
}

export interface ObjectiveRecord {
  id: string;
  tenantId: string;
  projectId: string;
  /** Incremented on every change; used for optimistic concurrency. */
  version: number;
  title: string;
  priority: ObjectivePriority;
  ownerId: string;
  unit: string;
  direction: ObjectiveDirection;
  baseline: number;
  target: number;
  currentValue: number;
  startDate: string;
  targetDate: string;
  visibility: ObjectiveVisibility;
  /** Opaque reference to the project charter. */
  charterReference: string | null;
  criteria: SuccessCriterion[];
  status: ObjectiveStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CriterionView extends SuccessCriterion {
  met: boolean;
}

export interface ObjectiveView {
  id: string;
  projectId: string;
  version: number;
  title: string;
  priority: ObjectivePriority;
  status: ObjectiveStatus;
  visibility: ObjectiveVisibility;
  targetDate: string;
  progressPercent: number;
  /** True when the full detail below is included. Public viewers outside the project get false. */
  detailed: boolean;
  ownerId?: string;
  unit?: string;
  direction?: ObjectiveDirection;
  baseline?: number;
  target?: number;
  currentValue?: number;
  startDate?: string;
  charterReference?: string | null;
  criteria?: CriterionView[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ObjectivesActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface ObjectivesAuditEntry {
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
