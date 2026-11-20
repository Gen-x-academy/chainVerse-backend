export interface ProjectSummary {
  id: string;
  ownerId: string;
  status: 'active' | 'submitted' | 'published' | 'blocked';
  dueAt: string;
}

// CAPSTONE-113: program-wide counts by status (no private content).
export function programAnalytics(projects: ProjectSummary[]) {
  const byStatus: Record<string, number> = {};
  for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  return { total: projects.length, byStatus };
}

// CAPSTONE-114: a participant only sees their own projects.
export function participantDashboard(projects: ProjectSummary[], userId: string, now = new Date()) {
  const mine = projects.filter((p) => p.ownerId === userId);
  return { projects: mine, overdue: mine.filter((p) => p.status === 'active' && new Date(p.dueAt) < now).length };
}

// CAPSTONE-115: coordinator view of projects needing attention.
export function coordinatorDashboard(projects: ProjectSummary[], now = new Date()) {
  return {
    awaitingReview: projects.filter((p) => p.status === 'submitted').length,
    blocked: projects.filter((p) => p.status === 'blocked').map((p) => p.id),
    overdue: projects.filter((p) => p.status === 'active' && new Date(p.dueAt) < now).map((p) => p.id),
  };
}

// CAPSTONE-116: service-level objectives and a simple compliance check.
export const CAPSTONE_SLOS = { availability: 0.995, p95LatencyMs: 500, reviewTurnaroundHours: 72 };

export function meetsSlo(metrics: { availability: number; p95LatencyMs: number }): boolean {
  return metrics.availability >= CAPSTONE_SLOS.availability && metrics.p95LatencyMs <= CAPSTONE_SLOS.p95LatencyMs;
}
