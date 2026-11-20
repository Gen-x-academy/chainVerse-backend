import { createHash } from 'crypto';
import { buildResearchPackage, buildShowcasePage, mintCredential, verifyCredential, verifyOutputHash } from './capstone-outputs';

describe('capstone outputs', () => {
  it('builds showcase pages for published projects only', () => {
    const page = buildShowcasePage({ id: 'p1', title: 'My Project', summary: 's', status: 'published', privateNotes: 'x' });
    expect(page).not.toHaveProperty('privateNotes');
    expect(page.slug).toBe('my-project');
    expect(() => buildShowcasePage({ id: 'p1', title: 't', summary: 's', status: 'draft' })).toThrow('CAPSTONE_PROJECT_NOT_PUBLISHED');
  });

  it('mints and verifies credentials', () => {
    const cred = mintCredential('u1', 'p1', 'lead', 'k');
    expect(verifyCredential(cred, 'k')).toBe(true);
    expect(verifyCredential({ ...cred, role: 'member' }, 'k')).toBe(false);
  });

  it('verifies output hashes', () => {
    const hash = createHash('sha256').update('data').digest('hex');
    expect(verifyOutputHash('data', hash)).toBe(true);
  });

  it('builds reproducible packages regardless of key order', () => {
    expect(buildResearchPackage({ b: '2', a: '1' }).manifestHash).toBe(buildResearchPackage({ a: '1', b: '2' }).manifestHash);
  });
});
