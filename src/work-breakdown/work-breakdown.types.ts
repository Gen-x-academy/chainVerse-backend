/**
 * CAPSTONE-058 — Work Breakdown Structures
 *
 * Shared types, enums, and view interfaces for the WBS domain.
 * All record types include tenantId for strict tenant isolation;
 * all view types omit private / sensitive fields before returning to callers.
 */

/** Roles a user may hold on a specific WBS package. */
export enum WbsRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  EXECUTOR = 'executor',
  REVIEWER = 'reviewer',
  VIEWER = 'viewer',
}

/** Lifecycle states of a work package. */
export enum PackageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  REVIEW = 'review',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

/** Progress weight units. */
export enum WeightUnit {
  STORY_POINTS = 'story_points',
  HOURS = 'hours',
  PERCENTAGE = 'percentage',
}

export const VALID_STATUS_TRANSITIONS: Record<PackageStatus, PackageStatus[]> =
  {
    [PackageStatus.PENDING]: [
      PackageStatus.IN_PROGRESS,
      PackageStatus.CANCELLED,
    ],
    [PackageStatus.IN_PROGRESS]: [
      PackageStatus.BLOCKED,
      PackageStatus.REVIEW,
      PackageStatus.DONE,
      PackageStatus.CANCELLED,
    ],
    [PackageStatus.BLOCKED]: [
      PackageStatus.IN_PROGRESS,
      PackageStatus.CANCELLED,
    ],
    [PackageStatus.REVIEW]: [
      PackageStatus.IN_PROGRESS,
      PackageStatus.DONE,
      PackageStatus.CANCELLED,
    ],
    [PackageStatus.DONE]: [],
    [PackageStatus.CANCELLED]: [],
  };

export const TERMINAL_STATUSES: PackageStatus[] = [
  PackageStatus.DONE,
  PackageStatus.CANCELLED,
];

// ── Records (internal / persistence shape) ───────────────────────────────────

export interface WbsRecord {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  description: string | null;
  /** Ordered list of package IDs (order determines position in breakdown). */
  orderedPackages: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackageRecord {
  id: string;
  tenantId: string;
  wbsId: string;
  projectId: string;
  /** Display order position, 1-based. */
  order: number;
  title: string;
  description: string | null;
  status: PackageStatus;
  /** Ids of packages this package depends on (must be in same WBS). */
  dependsOn: string[];
  assignees: string[];
  /** Estimated effort. */
  estimate: EstimateRecord | null;
  /** Acceptance conditions text list. */
  acceptanceCriteria: string[];
  /** Progress weight (0–100). */
  progressWeight: number;
  /** Roles granted on this specific package, keyed by userId. */
  roles: Record<string, WbsRole>;
  /** Idempotency key; never returned to callers. */
  idempotencyKey: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateRecord {
  value: number;
  unit: WeightUnit;
  addedBy: string;
  addedAt: string;
}

export interface TaskRecord {
  id: string;
  tenantId: string;
  packageId: string;
  wbsId: string;
  projectId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyRecord {
  id: string;
  tenantId: string;
  wbsId: string;
  fromPackageId: string;
  toPackageId: string;
  createdBy: string;
  createdAt: string;
}

export interface WbsAuditEntry {
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

// ── Views (public API shape — no private fields) ──────────────────────────────

export interface WbsView {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  orderedPackages: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackageView {
  id: string;
  wbsId: string;
  projectId: string;
  order: number;
  title: string;
  description: string | null;
  status: PackageStatus;
  dependsOn: string[];
  assignees: string[];
  estimate: EstimateView | null;
  acceptanceCriteria: string[];
  progressWeight: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateView {
  value: number;
  unit: WeightUnit;
  addedBy: string;
  addedAt: string;
}

export interface TaskView {
  id: string;
  packageId: string;
  wbsId: string;
  projectId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyView {
  id: string;
  wbsId: string;
  fromPackageId: string;
  toPackageId: string;
  createdBy: string;
  createdAt: string;
}

export interface WbsActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface WbsProgressReport {
  wbsId: string;
  totalWeight: number;
  completedWeight: number;
  progressPercent: number;
  packageBreakdown: Array<{
    packageId: string;
    title: string;
    status: PackageStatus;
    progressWeight: number;
  }>;
}
