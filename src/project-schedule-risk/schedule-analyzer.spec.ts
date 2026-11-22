import { analyzeSchedule } from './schedule-analyzer';
import { TaskRecord, TaskStatus } from './project-schedule-risk.types';

const task = (
  id: string,
  startDate: string,
  endDate: string,
  extra: Partial<TaskRecord> = {},
): TaskRecord => ({
  id,
  tenantId: 't',
  projectId: 'p',
  version: 1,
  title: `title-${id}`,
  assigneeId: null,
  startDate,
  endDate,
  dependsOn: [],
  status: TaskStatus.PLANNED,
  createdBy: 'u',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  ...extra,
});

const run = (
  tasks: TaskRecord[],
  extra: Partial<Parameters<typeof analyzeSchedule>[0]> = {},
) =>
  analyzeSchedule({
    tasks,
    deadline: null,
    asOf: '2027-01-01',
    includeAssignees: true,
    ...extra,
  });

const diamond = () => [
  task('A', '2027-01-01', '2027-01-03'),
  task('B', '2027-01-04', '2027-01-06', { dependsOn: ['A'] }),
  task('C', '2027-01-04', '2027-01-05', { dependsOn: ['A'] }),
  task('D', '2027-01-07', '2027-01-08', { dependsOn: ['B', 'C'] }),
];

describe('analyzeSchedule', () => {
  it('finds the critical path and slack of a diamond', () => {
    const result = run(diamond());
    expect(result.criticalPath).toEqual(['A', 'B', 'D']);
    expect(result.tasks.find((t) => t.taskId === 'C')).toMatchObject({
      slackDays: 1,
      critical: false,
    });
    expect(result.projectedFinish).toBe('2027-01-08');
    expect(result.findings).toEqual([]);
    expect(result.deadlineStatus).toBe('no_deadline');
  });

  it('ignores cancelled tasks and treats done predecessors as satisfied', () => {
    const tasks = diamond();
    tasks[0].status = TaskStatus.DONE;
    tasks[2].status = TaskStatus.CANCELLED;
    const result = run(tasks, { asOf: '2027-01-04' });
    expect(result.tasks.map((t) => t.taskId).sort()).toEqual(['B', 'D']);
    expect(result.criticalPath).toEqual(['B', 'D']);
    expect(result.projectedFinish).toBe('2027-01-08');
  });

  it('reports complete when nothing is left to do', () => {
    const result = run(
      [task('A', '2027-01-01', '2027-01-02', { status: TaskStatus.DONE })],
      { deadline: '2027-01-02' },
    );
    expect(result.deadlineStatus).toBe('complete');
    expect(result.projectedFinish).toBeNull();
  });

  it('flags a task that starts before its predecessor ends', () => {
    const result = run([
      task('A', '2027-01-01', '2027-01-03'),
      task('B', '2027-01-03', '2027-01-05', { dependsOn: ['A'] }),
    ]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: 'impossible_dates',
        code: 'START_BEFORE_PREDECESSOR_END',
        taskIds: ['A', 'B'],
      }),
    );
  });

  it('flags tasks whose dates are already in the past', () => {
    const result = run(
      [
        task('A', '2027-01-01', '2027-01-03'),
        task('B', '2027-01-04', '2027-01-09', { status: TaskStatus.PLANNED }),
        task('C', '2027-01-20', '2027-01-25'),
      ],
      { asOf: '2027-01-05' },
    );
    const codes = result.findings.map((f) => `${f.code}:${f.taskIds[0]}`);
    expect(codes).toContain('END_IN_PAST:A');
    expect(codes).toContain('START_IN_PAST:B');
    expect(codes.some((c) => c.endsWith(':C'))).toBe(false);
  });

  it('detects assignee overlaps but not back-to-back or finished work', () => {
    const result = run([
      task('A', '2027-01-01', '2027-01-05', { assigneeId: 'u1' }),
      task('B', '2027-01-05', '2027-01-08', { assigneeId: 'u1' }),
      task('C', '2027-01-06', '2027-01-09', { assigneeId: 'u1' }),
      task('D', '2027-01-01', '2027-01-09', {
        assigneeId: 'u1',
        status: TaskStatus.DONE,
      }),
      task('E', '2027-01-01', '2027-01-09', { assigneeId: 'u2' }),
    ]);
    const conflicts = result.findings.filter(
      (f) => f.type === 'resource_conflict',
    );
    expect(conflicts.map((f) => f.taskIds.join('+')).sort()).toEqual([
      'A+B',
      'B+C',
    ]);
    expect(conflicts.every((f) => f.assigneeId === 'u1')).toBe(true);
  });

  it('omits assignee ids when the caller may not see them', () => {
    const result = run(
      [
        task('A', '2027-01-01', '2027-01-05', { assigneeId: 'u1' }),
        task('B', '2027-01-02', '2027-01-06', { assigneeId: 'u1' }),
      ],
      { includeAssignees: false },
    );
    expect(JSON.stringify(result)).not.toContain('u1');
  });

  it('caps resource-conflict findings and says so', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      task(`T${i}`, '2027-01-01', '2027-01-10', { assigneeId: 'u1' }),
    );
    const result = run(many);
    expect(
      result.findings.filter((f) => f.type === 'resource_conflict'),
    ).toHaveLength(50);
    expect(result.conflictsTruncated).toBe(true);
  });

  it('surfaces a blocked task on the critical path with the work it holds up', () => {
    const tasks = diamond();
    tasks[1].status = TaskStatus.BLOCKED;
    const result = run(tasks);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: 'blocked_critical_path',
        severity: 'critical',
        taskIds: ['B', 'D'],
      }),
    );
  });

  it('does not call a blocked task with slack a blocked critical path', () => {
    const tasks = diamond();
    tasks[2].status = TaskStatus.BLOCKED;
    const result = run(tasks);
    expect(
      result.findings.some((f) => f.type === 'blocked_critical_path'),
    ).toBe(false);
  });

  it('classifies deadline risk from the projected finish', () => {
    const base = diamond();
    expect(run(base, { deadline: '2027-01-30' }).deadlineStatus).toBe(
      'on_track',
    );
    const atRisk = run(base, { deadline: '2027-01-10' });
    expect(atRisk.deadlineStatus).toBe('at_risk');
    expect(atRisk.marginDays).toBe(2);
    const late = run(base, { deadline: '2027-01-06' });
    expect(late.deadlineStatus).toBe('late');
    expect(late.marginDays).toBe(-2);
    expect(late.findings[0]).toMatchObject({
      type: 'deadline_risk',
      code: 'DEADLINE_EXCEEDED',
      severity: 'critical',
    });
  });

  it('projects slipped work from the analysis date, not the plan', () => {
    const result = run([task('A', '2027-01-01', '2027-01-02')], {
      asOf: '2027-01-10',
      deadline: '2027-01-05',
    });
    expect(result.projectedFinish).toBe('2027-01-11');
    expect(result.deadlineStatus).toBe('late');
  });

  it('reports a cycle defensively instead of looping', () => {
    const result = run([
      task('A', '2027-01-01', '2027-01-02', { dependsOn: ['B'] }),
      task('B', '2027-01-03', '2027-01-04', { dependsOn: ['A'] }),
      task('C', '2027-01-03', '2027-01-04'),
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        type: 'dependency_cycle',
        severity: 'critical',
        taskIds: ['A', 'B'],
      }),
    ]);
    expect(result.tasks).toEqual([]);
  });

  it('never puts titles in findings', () => {
    const tasks = diamond();
    tasks[1].status = TaskStatus.BLOCKED;
    expect(
      JSON.stringify(run(tasks, { deadline: '2027-01-02' })),
    ).not.toContain('title-');
  });
});
