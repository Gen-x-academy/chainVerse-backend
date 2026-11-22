/**
 * Domain types for schedule dependency and risk analysis (CAPSTONE-059).
 *
 * Dates are day-granular (UTC, `YYYY-MM-DD`, end date inclusive).
 */

export const SCHEDULE_ADMIN_ROLES = ['admin', 'moderator'] as const;

export enum ScheduleProjectRole {
  OWNER = 'owner',
  PLANNER = 'planner',
  VIEWER = 'viewer',
}

/** Project roles that may change the schedule. */
export const SCHEDULE_MANAGE_ROLES: readonly ScheduleProjectRole[] = [
  ScheduleProjectRole.OWNER,
  ScheduleProjectRole.PLANNER,
];

export enum TaskStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export const ALLOWED_TASK_TRANSITIONS: Record<
  TaskStatus,
  readonly TaskStatus[]
> = {
  [TaskStatus.PLANNED]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.BLOCKED,
    TaskStatus.DONE,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.BLOCKED]: [
    TaskStatus.PLANNED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.DONE]: [],
  [TaskStatus.CANCELLED]: [],
};

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.DONE,
  TaskStatus.CANCELLED,
];

export const MAX_TASKS_PER_PROJECT = 200;
export const MAX_DEPENDENCIES_PER_TASK = 20;
/** A projected finish within this many days of the deadline is "at risk". */
export const DEADLINE_BUFFER_DAYS = 5;
/** Upper bound on resource-conflict findings returned per analysis. */
export const MAX_CONFLICT_FINDINGS = 50;
export const MAX_SNAPSHOTS_PER_PROJECT = 50;

export interface ScheduleProjectStub {
  id: string;
  tenantId: string;
  members: Record<string, ScheduleProjectRole>;
  /** Project deadline, `YYYY-MM-DD`, or null when none is set. */
  deadline: string | null;
}

export interface TaskRecord {
  id: string;
  tenantId: string;
  projectId: string;
  version: number;
  title: string;
  assigneeId: string | null;
  startDate: string;
  endDate: string;
  dependsOn: string[];
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskView {
  id: string;
  projectId: string;
  version: number;
  title: string;
  /** Only project owners/planners and admins see who a task is assigned to. */
  assigneeId?: string | null;
  assigned: boolean;
  startDate: string;
  endDate: string;
  dependsOn: string[];
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'high' | 'medium';

export type FindingType =
  | 'dependency_cycle'
  | 'impossible_dates'
  | 'resource_conflict'
  | 'blocked_critical_path'
  | 'deadline_risk';

export interface ScheduleFinding {
  type: FindingType;
  /** Stable machine-readable sub-code, e.g. `START_BEFORE_PREDECESSOR_END`. */
  code: string;
  severity: FindingSeverity;
  /** Task ids involved. Findings never carry titles or free text. */
  taskIds: string[];
  /** Only present on resource conflicts, and only for managers/admins. */
  assigneeId?: string | null;
  /** Stable identity used to de-duplicate notifications. */
  key: string;
}

export type DeadlineStatus =
  | 'no_deadline'
  | 'complete'
  | 'on_track'
  | 'at_risk'
  | 'late';

export interface TaskProjection {
  taskId: string;
  projectedStart: string;
  projectedEnd: string;
  slackDays: number;
  critical: boolean;
}

export interface ScheduleAnalysis {
  asOf: string;
  deadline: string | null;
  projectedFinish: string | null;
  /** Days between the projected finish and the deadline; negative means late. */
  marginDays: number | null;
  deadlineStatus: DeadlineStatus;
  criticalPath: string[];
  tasks: TaskProjection[];
  findings: ScheduleFinding[];
  conflictsTruncated: boolean;
}

export interface AnalysisSnapshot {
  id: string;
  projectId: string;
  takenAt: string;
  asOf: string;
  deadlineStatus: DeadlineStatus;
  marginDays: number | null;
  findingCounts: Record<FindingSeverity, number>;
  newlyNotified: number;
  notificationsFailed: number;
}

export interface ScheduleRiskEvent {
  tenantId: string;
  projectId: string;
  type: FindingType;
  code: string;
  severity: FindingSeverity;
  taskIds: string[];
}

export interface ScheduleRiskNotifier {
  notify(event: ScheduleRiskEvent): Promise<void>;
}

export const SCHEDULE_RISK_NOTIFIER = Symbol('SCHEDULE_RISK_NOTIFIER');

export interface ScheduleActor {
  actorId: string;
  tenantId: string;
  roles: string[];
}

export interface ScheduleAuditEntry {
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
