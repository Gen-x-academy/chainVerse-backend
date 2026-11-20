import { createHash, createHmac } from 'crypto';

// CAPSTONE-093: public showcase page only exposes published, safe fields.
export function buildShowcasePage(project: { id: string; title: string; summary: string; status: string; privateNotes?: string }) {
  if (project.status !== 'published') throw new Error('CAPSTONE_PROJECT_NOT_PUBLISHED');
  return { id: project.id, title: project.title, summary: project.summary, slug: project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
}

// CAPSTONE-094: signed completion/contribution credential.
export function mintCredential(userId: string, projectId: string, role: string, secret: string) {
  const payload = `${userId}:${projectId}:${role}`;
  return { userId, projectId, role, signature: createHmac('sha256', secret).update(payload).digest('hex') };
}

// CAPSTONE-095: verify a credential or output publicly.
export function verifyCredential(cred: { userId: string; projectId: string; role: string; signature: string }, secret: string): boolean {
  return mintCredential(cred.userId, cred.projectId, cred.role, secret).signature === cred.signature;
}

export function verifyOutputHash(content: string, expectedHash: string): boolean {
  return createHash('sha256').update(content).digest('hex') === expectedHash;
}

// CAPSTONE-096: reproducible package manifest (sorted, hashed files).
export function buildResearchPackage(files: Record<string, string>) {
  const entries = Object.keys(files)
    .sort()
    .map((path) => ({ path, sha256: createHash('sha256').update(files[path]).digest('hex') }));
  const manifestHash = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  return { entries, manifestHash };
}
