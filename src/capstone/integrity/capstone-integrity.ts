// CAPSTONE-097: word-overlap originality score and citation check.
export function similarityScore(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.max(wa.size, wb.size);
}

export function hasCitations(text: string): boolean {
  return /\[\d+\]|\(\w+,\s*\d{4}\)/.test(text);
}

// CAPSTONE-098: projects touching these topics need ethics review.
const ETHICS_FLAGS = ['human-subjects', 'personal-data', 'minors', 'medical'];

export function needsEthicsReview(tags: string[]): boolean {
  return tags.some((t) => ETHICS_FLAGS.includes(t));
}

// CAPSTONE-099: validate an integrity concern report.
export function validateConcernReport(report: { reporterId: string; projectId: string; reason: string }): void {
  if (!report.reporterId || !report.projectId) throw new Error('CAPSTONE_REPORT_TARGET_REQUIRED');
  if (report.reason.trim().length < 10) throw new Error('CAPSTONE_REPORT_REASON_TOO_SHORT');
}

// CAPSTONE-100: triage priority for integrity and safety cases.
export function triagePriority(kind: 'plagiarism' | 'ethics' | 'safety', reports: number): 'low' | 'medium' | 'high' {
  if (kind === 'safety' || reports >= 5) return 'high';
  if (kind === 'ethics' || reports >= 2) return 'medium';
  return 'low';
}
