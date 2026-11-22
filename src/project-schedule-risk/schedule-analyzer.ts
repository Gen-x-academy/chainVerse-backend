import {
  DEADLINE_BUFFER_DAYS,
  DeadlineStatus,
  FindingSeverity,
  MAX_CONFLICT_FINDINGS,
  ScheduleAnalysis,
  ScheduleFinding,
  TaskProjection,
  TaskRecord,
  TaskStatus,
} from './project-schedule-risk.types';

const DAY_MS = 86_400_000;

export const toDay = (date: string): number =>
  Math.floor(Date.parse(date) / DAY_MS);
export const fromDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

export interface AnalyzerInput {
  tasks: TaskRecord[];
  deadline: string | null;
  /** `YYYY-MM-DD`; remaining work cannot start before this day. */
  asOf: string;
  /** Whether findings may carry assignee ids. */
  includeAssignees: boolean;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

/**
 * Pure schedule analysis: finish-to-start critical path, impossible dates,
 * resource conflicts, blocked critical paths and deadline risk.
 *
 * Cancelled tasks are ignored. Done tasks are treated as satisfied
 * predecessors and contribute no remaining work. Findings reference task ids
 * only — never titles or free text.
 */
export function analyzeSchedule(input: AnalyzerInput): ScheduleAnalysis {
  const asOfDay = toDay(input.asOf);
  const live = input.tasks.filter((t) => t.status !== TaskStatus.CANCELLED);
  const byId = new Map(live.map((t) => [t.id, t]));
  const isOpen = (t: TaskRecord) => t.status !== TaskStatus.DONE;
  const predsOf = (t: TaskRecord) =>
    t.dependsOn.map((id) => byId.get(id)).filter((p): p is TaskRecord => !!p);

  const findings: ScheduleFinding[] = [];
  const add = (f: Omit<ScheduleFinding, 'key'>): void => {
    findings.push({ ...f, key: `${f.type}:${f.code}:${f.taskIds.join(',')}` });
  };

  // ── Topological order (Kahn). A leftover set means a cycle slipped in. ────
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const t of live) {
    indegree.set(t.id, predsOf(t).length);
    successors.set(t.id, []);
  }
  for (const t of live) {
    for (const p of predsOf(t)) successors.get(p.id)!.push(t.id);
  }
  const queue = live.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order: TaskRecord[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const s of successors.get(id)!) {
      indegree.set(s, indegree.get(s)! - 1);
      if (indegree.get(s) === 0) queue.push(s);
    }
  }
  if (order.length < live.length) {
    const inOrder = new Set(order.map((t) => t.id));
    add({
      type: 'dependency_cycle',
      code: 'CYCLE_DETECTED',
      severity: 'critical',
      taskIds: live
        .filter((t) => !inOrder.has(t.id))
        .map((t) => t.id)
        .sort(),
    });
    return {
      asOf: input.asOf,
      deadline: input.deadline,
      projectedFinish: null,
      marginDays: null,
      deadlineStatus: input.deadline ? 'at_risk' : 'no_deadline',
      criticalPath: [],
      tasks: [],
      findings,
      conflictsTruncated: false,
    };
  }

  // ── Forward pass: earliest projected start/finish of remaining work ───────
  const startDay = (t: TaskRecord) => toDay(t.startDate);
  const endDay = (t: TaskRecord) => toDay(t.endDate);
  const duration = (t: TaskRecord) => endDay(t) - startDay(t) + 1;
  const remaining = (t: TaskRecord) =>
    t.status === TaskStatus.IN_PROGRESS
      ? Math.max(1, Math.min(duration(t), endDay(t) - asOfDay + 1))
      : duration(t);

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const t of order) {
    if (!isOpen(t)) continue;
    let start =
      t.status === TaskStatus.IN_PROGRESS
        ? asOfDay
        : Math.max(startDay(t), asOfDay);
    for (const p of predsOf(t)) {
      if (isOpen(p)) start = Math.max(start, ef.get(p.id)! + 1);
    }
    es.set(t.id, start);
    ef.set(t.id, start + remaining(t) - 1);
  }
  const openOrder = order.filter(isOpen);
  const finish = openOrder.length
    ? Math.max(...openOrder.map((t) => ef.get(t.id)!))
    : null;

  // ── Backward pass: slack and critical path ────────────────────────────────
  const ls = new Map<string, number>();
  const slack = new Map<string, number>();
  for (const t of [...openOrder].reverse()) {
    const openSuccs = successors
      .get(t.id)!
      .filter((id) => isOpen(byId.get(id)!));
    const lf = openSuccs.length
      ? Math.min(...openSuccs.map((id) => ls.get(id)! - 1))
      : finish!;
    const lstart = lf - remaining(t) + 1;
    ls.set(t.id, lstart);
    slack.set(t.id, lstart - es.get(t.id)!);
  }
  const critical = new Set(
    openOrder.filter((t) => slack.get(t.id) === 0).map((t) => t.id),
  );
  const projections: TaskProjection[] = openOrder
    .map((t) => ({
      taskId: t.id,
      projectedStart: fromDay(es.get(t.id)!),
      projectedEnd: fromDay(ef.get(t.id)!),
      slackDays: slack.get(t.id)!,
      critical: critical.has(t.id),
    }))
    .sort((a, b) =>
      a.projectedStart === b.projectedStart
        ? a.taskId.localeCompare(b.taskId)
        : a.projectedStart.localeCompare(b.projectedStart),
    );
  const criticalPath = projections
    .filter((p) => p.critical)
    .map((p) => p.taskId);

  // ── Impossible dates ──────────────────────────────────────────────────────
  for (const t of live) {
    if (!isOpen(t)) continue;
    for (const p of predsOf(t)) {
      if (isOpen(p) && startDay(t) <= endDay(p)) {
        add({
          type: 'impossible_dates',
          code: 'START_BEFORE_PREDECESSOR_END',
          severity: 'high',
          taskIds: [p.id, t.id],
        });
      }
    }
    if (endDay(t) < asOfDay) {
      add({
        type: 'impossible_dates',
        code: 'END_IN_PAST',
        severity: critical.has(t.id) ? 'high' : 'medium',
        taskIds: [t.id],
      });
    } else if (
      startDay(t) < asOfDay &&
      (t.status === TaskStatus.PLANNED || t.status === TaskStatus.BLOCKED)
    ) {
      add({
        type: 'impossible_dates',
        code: 'START_IN_PAST',
        severity: 'medium',
        taskIds: [t.id],
      });
    }
  }

  // ── Resource conflicts: one assignee, overlapping open tasks ──────────────
  const byAssignee = new Map<string, TaskRecord[]>();
  for (const t of openOrder) {
    if (!t.assigneeId) continue;
    byAssignee.set(t.assigneeId, [...(byAssignee.get(t.assigneeId) ?? []), t]);
  }
  let conflictCount = 0;
  let conflictsTruncated = false;
  for (const [assigneeId, list] of [...byAssignee.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const sorted = [...list].sort(
      (a, b) => startDay(a) - startDay(b) || a.id.localeCompare(b.id),
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (startDay(b) > endDay(a)) break;
        if (conflictCount >= MAX_CONFLICT_FINDINGS) {
          conflictsTruncated = true;
          continue;
        }
        conflictCount++;
        add({
          type: 'resource_conflict',
          code: 'ASSIGNEE_OVERLAP',
          severity:
            critical.has(a.id) && critical.has(b.id) ? 'high' : 'medium',
          taskIds: [a.id, b.id].sort(),
          ...(input.includeAssignees ? { assigneeId } : {}),
        });
      }
    }
  }

  // ── Blocked critical path ─────────────────────────────────────────────────
  for (const t of openOrder) {
    if (t.status !== TaskStatus.BLOCKED || !critical.has(t.id)) continue;
    const impacted = new Set<string>();
    const stack = [...successors.get(t.id)!];
    while (stack.length) {
      const id = stack.pop()!;
      if (impacted.has(id)) continue;
      impacted.add(id);
      stack.push(...successors.get(id)!);
    }
    add({
      type: 'blocked_critical_path',
      code: 'BLOCKED_ON_CRITICAL_PATH',
      severity: 'critical',
      taskIds: [
        t.id,
        ...[...impacted]
          .filter((id) => critical.has(id) && isOpen(byId.get(id)!))
          .sort(),
      ],
    });
  }

  // ── Deadline risk ─────────────────────────────────────────────────────────
  let marginDays: number | null = null;
  let deadlineStatus: DeadlineStatus;
  if (finish === null) {
    deadlineStatus = 'complete';
  } else if (!input.deadline) {
    deadlineStatus = 'no_deadline';
  } else {
    marginDays = toDay(input.deadline) - finish;
    if (marginDays < 0) {
      deadlineStatus = 'late';
      add({
        type: 'deadline_risk',
        code: 'DEADLINE_EXCEEDED',
        severity: 'critical',
        taskIds: criticalPath,
      });
    } else if (marginDays <= DEADLINE_BUFFER_DAYS) {
      deadlineStatus = 'at_risk';
      add({
        type: 'deadline_risk',
        code: 'DEADLINE_AT_RISK',
        severity: 'high',
        taskIds: criticalPath,
      });
    } else {
      deadlineStatus = 'on_track';
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.type.localeCompare(b.type) ||
      a.key.localeCompare(b.key),
  );

  return {
    asOf: input.asOf,
    deadline: input.deadline,
    projectedFinish: finish === null ? null : fromDay(finish),
    marginDays,
    deadlineStatus,
    criticalPath,
    tasks: projections,
    findings,
    conflictsTruncated,
  };
}
