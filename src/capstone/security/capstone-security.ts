import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// CAPSTONE-109: fields that must be encrypted at rest.
export const SENSITIVE_FIELDS = ['providerToken', 'privateNotes', 'preciseLocation', 'unpublishedIp', 'evidenceKey', 'payoutReference'];

export function encryptField(value: string, key: Buffer, keyVersion: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [keyVersion, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptField(payload: string, keys: Record<number, Buffer>): string {
  const [version, iv, tag, data] = payload.split(':');
  const key = keys[Number(version)];
  if (!key) throw new Error('CAPSTONE_KEY_VERSION_UNKNOWN');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// CAPSTONE-110: audit entries never carry private payloads.
export function buildAuditEntry(actorId: string, action: string, projectId: string, details: Record<string, unknown> = {}) {
  const safe = Object.fromEntries(Object.entries(details).filter(([k]) => !SENSITIVE_FIELDS.includes(k)));
  return { actorId, action, projectId, details: safe, at: new Date().toISOString() };
}

// CAPSTONE-111: documented abuse cases and their mitigations.
export const ABUSE_CASES = [
  { id: 'enumeration', mitigation: 'Deny-by-default authorization and opaque ids' },
  { id: 'replay', mitigation: 'Idempotency keys on every mutating request' },
  { id: 'harassment', mitigation: 'Participant blocking and moderation queue' },
  { id: 'data-exfiltration', mitigation: 'Field encryption and minimized audit logs' },
];

// CAPSTONE-112: every read must stay inside the caller's tenant.
export function assertSameTenant(callerTenantId: string, resourceTenantId: string): void {
  if (!callerTenantId || callerTenantId !== resourceTenantId) {
    throw new Error('CAPSTONE_TENANT_FORBIDDEN');
  }
}
