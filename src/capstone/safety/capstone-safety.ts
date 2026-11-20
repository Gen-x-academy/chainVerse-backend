export type ProtectiveMeasure = 'warn' | 'restrict-messaging' | 'remove-from-project' | 'suspend';

// CAPSTONE-101: measures escalate with severity (1-4).
export function selectProtectiveMeasure(severity: number): ProtectiveMeasure {
  const measures: ProtectiveMeasure[] = ['warn', 'restrict-messaging', 'remove-from-project', 'suspend'];
  if (severity < 1 || severity > 4) throw new Error('CAPSTONE_SEVERITY_INVALID');
  return measures[severity - 1];
}

// CAPSTONE-102: dispute lifecycle.
const DISPUTE_FLOW: Record<string, string[]> = {
  open: ['mediation', 'resolved'],
  mediation: ['resolved', 'escalated'],
  escalated: ['resolved'],
  resolved: [],
};

export function transitionDispute(from: string, to: string): string {
  if (!DISPUTE_FLOW[from]?.includes(to)) throw new Error('CAPSTONE_DISPUTE_TRANSITION_INVALID');
  return to;
}

// CAPSTONE-103: blocking works in both directions.
export function isBlocked(blocks: Array<[string, string]>, a: string, b: string): boolean {
  return blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// CAPSTONE-104: evidence retention periods in days.
export const EVIDENCE_RETENTION_DAYS: Record<string, number> = { report: 365, dispute: 730, suspension: 1095 };

export function isEvidenceExpired(kind: string, createdAt: Date, now = new Date()): boolean {
  const days = EVIDENCE_RETENTION_DAYS[kind];
  if (days === undefined) throw new Error('CAPSTONE_EVIDENCE_KIND_UNKNOWN');
  return now.getTime() - createdAt.getTime() > days * 86_400_000;
}
