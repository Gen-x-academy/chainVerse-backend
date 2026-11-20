export type Visibility = 'private' | 'team' | 'public';

export interface ConsentEntry {
  userId: string;
  purpose: string;
  granted: boolean;
  at: string;
}

// CAPSTONE-105: append-only consent ledger; latest entry wins.
export function recordConsent(ledger: ConsentEntry[], userId: string, purpose: string, granted: boolean): ConsentEntry[] {
  return [...ledger, { userId, purpose, granted, at: new Date().toISOString() }];
}

export function hasConsent(ledger: ConsentEntry[], userId: string, purpose: string): boolean {
  const entries = ledger.filter((e) => e.userId === userId && e.purpose === purpose);
  return entries.length > 0 && entries[entries.length - 1].granted;
}

// CAPSTONE-106: hide fields the viewer is not allowed to see.
export function applyFieldPrivacy(project: Record<string, unknown>, rules: Record<string, Visibility>, viewer: 'owner' | 'team' | 'public') {
  const allowed: Record<string, Visibility[]> = { owner: ['private', 'team', 'public'], team: ['team', 'public'], public: ['public'] };
  return Object.fromEntries(Object.entries(project).filter(([k]) => allowed[viewer].includes(rules[k] ?? 'private')));
}

// CAPSTONE-107: export only the requesting user's own records.
export function buildDataExport(userId: string, records: Array<{ ownerId: string } & Record<string, unknown>>) {
  return { userId, generatedAt: new Date().toISOString(), records: records.filter((r) => r.ownerId === userId) };
}

// CAPSTONE-108: erase personal fields but keep a tombstone for integrity.
export function eraseUserData(record: Record<string, unknown>, personalFields: string[]) {
  const erased = { ...record };
  for (const field of personalFields) delete erased[field];
  return { ...erased, erased: true, erasedAt: new Date().toISOString() };
}
