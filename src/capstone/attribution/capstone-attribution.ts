import { createHash } from 'crypto';

export interface Contributor {
  userId: string;
  role: string;
  share: number;
}

// CAPSTONE-089: contributor shares must be unique and total 100.
export function validateAttribution(contributors: Contributor[]): void {
  const ids = new Set(contributors.map((c) => c.userId));
  if (ids.size !== contributors.length) throw new Error('CAPSTONE_DUPLICATE_CONTRIBUTOR');
  const total = contributors.reduce((sum, c) => sum + c.share, 0);
  if (total !== 100) throw new Error('CAPSTONE_ATTRIBUTION_TOTAL_INVALID');
}

// CAPSTONE-090: provenance record with a content hash.
export function captureProvenance(outputId: string, content: string, authorIds: string[]) {
  const hash = createHash('sha256').update(content).digest('hex');
  return { outputId, hash, authorIds, capturedAt: new Date().toISOString() };
}

// CAPSTONE-091: supported intellectual property terms.
export const IP_TERMS = ['all-rights-reserved', 'cc-by-4.0', 'cc-by-nc-4.0', 'mit'];

export function assertIpTerm(term: string): void {
  if (!IP_TERMS.includes(term)) throw new Error('CAPSTONE_IP_TERM_INVALID');
}

// CAPSTONE-092: publication approval transitions.
const APPROVAL_FLOW: Record<string, string[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  rejected: ['pending'],
  approved: [],
};

export function transitionPublication(from: string, to: string): string {
  if (!APPROVAL_FLOW[from]?.includes(to)) throw new Error('CAPSTONE_PUBLICATION_TRANSITION_INVALID');
  return to;
}
