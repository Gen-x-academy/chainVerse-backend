import { ProjectSummary, coordinatorDashboard, meetsSlo, participantDashboard, programAnalytics } from './capstone-analytics';

describe('capstone analytics', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  const projects: ProjectSummary[] = [
    { id: 'p1', ownerId: 'u1', status: 'active', dueAt: '2026-11-01T00:00:00Z' },
    { id: 'p2', ownerId: 'u2', status: 'submitted', dueAt: '2026-12-01T00:00:00Z' },
  ];

  it('counts projects by status', () => {
    expect(programAnalytics(projects)).toEqual({ total: 2, byStatus: { active: 1, submitted: 1 } });
  });

  it('shows participants only their projects', () => {
    const view = participantDashboard(projects, 'u1', now);
    expect(view.projects).toHaveLength(1);
    expect(view.overdue).toBe(1);
  });

  it('lists coordinator work', () => {
    const view = coordinatorDashboard(projects, now);
    expect(view.awaitingReview).toBe(1);
    expect(view.overdue).toEqual(['p1']);
  });

  it('checks SLOs', () => {
    expect(meetsSlo({ availability: 0.999, p95LatencyMs: 200 })).toBe(true);
    expect(meetsSlo({ availability: 0.9, p95LatencyMs: 200 })).toBe(false);
  });
});
