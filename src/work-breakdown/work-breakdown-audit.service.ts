import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WbsAuditEntry } from './work-breakdown.types';

export type WbsAuditMetadata = Omit<WbsAuditEntry, 'id' | 'timestamp' | 'outcome'> & {
  outcome?: 'success' | 'denied';
};

/**
 * Lightweight in-process audit log for WBS mutations.
 * Records are sanitised (no private payloads) before storage.
 */
@Injectable()
export class WorkBreakdownAuditService {
  private readonly entries: WbsAuditEntry[] = [];

  record(metadata: WbsAuditMetadata): void {
    const entry: WbsAuditEntry = Object.freeze({
      id: randomUUID(),
      action: metadata.action,
      tenantId: metadata.tenantId,
      actorId: metadata.actorId,
      actorRoles: Object.freeze([...metadata.actorRoles]),
      resourceType: metadata.resourceType,
      resourceId: metadata.resourceId,
      outcome: metadata.outcome ?? 'success',
      fingerprint: metadata.fingerprint,
      requestHash: metadata.requestHash,
      timestamp: new Date().toISOString(),
    });
    this.entries.push(entry);
  }

  snapshot(): readonly WbsAuditEntry[] {
    return this.entries.map((e) => Object.freeze({ ...e }));
  }
}
