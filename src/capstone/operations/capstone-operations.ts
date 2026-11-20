// CAPSTONE-117: incident runbooks keyed by incident type.
export const INCIDENT_RUNBOOKS: Record<string, string[]> = {
  'escrow-failure': ['Pause milestone releases', 'Check ledger reconciliation', 'Notify coordinators'],
  'data-leak': ['Rotate encryption keys', 'Revoke exposed tokens', 'Notify privacy lead'],
  'outage': ['Check health endpoint', 'Roll back latest deploy', 'Post status update'],
};

export function getRunbook(type: string): string[] {
  const steps = INCIDENT_RUNBOOKS[type];
  if (!steps) throw new Error('CAPSTONE_RUNBOOK_NOT_FOUND');
  return steps;
}

// CAPSTONE-118: run tasks with a concurrency limit (used by load tests).
export async function runConcurrently<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// CAPSTONE-119: ordered stages of the capstone journey.
export const JOURNEY_STAGES = ['proposal', 'approved', 'in-progress', 'submitted', 'reviewed', 'published'];

export function canAdvance(from: string, to: string): boolean {
  return JOURNEY_STAGES.indexOf(to) === JOURNEY_STAGES.indexOf(from) + 1;
}

// CAPSTONE-120: rollout phases with rollback targets.
export const ROLLOUT_PLAN = [
  { phase: 'internal', percent: 5, rollback: 'disable feature flag' },
  { phase: 'beta', percent: 25, rollback: 'disable feature flag' },
  { phase: 'general', percent: 100, rollback: 'revert migration and redeploy previous release' },
];
