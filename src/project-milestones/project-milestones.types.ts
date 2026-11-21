/**
 * Domain types for the Project Milestones feature (CAPSTONE-060).
 *
 * Separation of concerns:
 *  - *Record  = what is persisted (in-memory, full fidelity)
 *  - *View    = what is returned to callers (redacted — no private fields)
 *  - *Actor   = resolved identity attached by the guard layer
 */

export const PLATFORM_MILESTONE_ROLES = [
  'admin',
  'moderator',
  'tutor',
] as const;

/** Roles a user may hold inside a project. */
export enum MilestoneProjectRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

/** Lifecycle states of a milestone, ordered from creation to resolution. */
export enum MilestoneStatus {
  /** Created; definition may still be updated. */
  DRAFT = 'draft',
  /** Locked; evidence collection may begin. */
  ACTIVE = 'active',
  /** All deliverables accepted by the reviewer. */
  COMPLETED = 'completed',
  /** Explicitly abandoned. */
  CANCELLED = 'cancelled',
}

/** Which transitions are allowed from a given status. */
export const ALLOWED_MILESTONE_TRANSITIONS: Record<
  MilestoneStatus,
  readonly MilestoneStatus[]
> = {
  [MilestoneStatus.DRAFT]: [MilestoneStatus.ACTIVE, MilestoneStatus.CANCELLED],
  [MilestoneStatus.ACTIVE]: [
    MilestoneStatus.COMPLETED,
    MilestoneStatus.CANCELLED,
  ],
  [MilestoneStatus.COMPLETED]: [],
  [MilestoneStatus.CANCELLED]: [],
};

/** Terminal states in which no further mutation is allowed. */
export const TERMINAL_MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  MilestoneStatus.COMPLETED,
  MilestoneStatus.CANCELLED,
];

// ── Records (stored) ─────────────────────────────────────────────────────────

export interface MilestoneRecord {
  id: string;
  tenantId: string;
  projectId: string;
  /** Display title shown to all participants. */
  title: string;
  /** Optional description of what this milestone covers. Never logged. */
  description?: string;
  /** Monotonic order within the project, 1-based. */
  sequence: number;
  /** ISO-8601 date by which the milestone must be completed. */
  dueDate: string;
  status: MilestoneStatus;
  /**
   * User IDs of predecessors that must reach COMPLETED before this milestone
   * may be transitioned to ACTIVE.
   */
  dependsOn: string[];
  /** User ID of the designated reviewer for this milestone. */
  reviewerId: string | null;
  /** Free-form list of expected deliverables. Never logged individually. */
  deliverables: string[];
  /**
   * Optional funding link to an external budget line item (e.g. from the
   * project-funding module). Stored as an opaque reference; the milestones
   * domain does not validate it.
   */
  fundingReferenceId: string | null;
  /** Completion criteria note authored by a planner. Never logged. */
  completionCriteria: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** Free-text note recorded when the milestone is cancelled. Never logged. */
  cancellationReason: string | null;
}

/** Project record stub — only the fields the milestones service needs. */
export interface MilestoneProjectStub {
  id: string;
  tenantId: string;
  members: Record<string, MilestoneProjectRole>;
}

// ── Views (returned to callers — private fields redacted) ────────────────────

export interface MilestoneView {
  id: string;
  projectId: string;
  title: string;
  sequence: number;
  dueDate: string;
  status: MilestoneStatus;
  dependsOn: string[];
  reviewerId: string | null;
  /** Number of deliverables defined; actual strings are not surfaced. */
  deliverableCount: number;
  fundingReferenceId: string | null;
  /** True when completionCriteria is non-empty. */
  hasCompletionCriteria: boolean;
  /** True when description is non-empty. */
  hasDescription: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** True when cancellationReason is non-empty. */
  hasCancellationReason: boolean;
}

// ── Actor ─────────────────────────────────────────────────────────────────────

export interface MilestonesActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface MilestoneAuditEntry {
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
