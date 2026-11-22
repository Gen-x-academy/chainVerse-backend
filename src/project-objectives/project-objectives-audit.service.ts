import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ObjectivesAuditEntry } from './project-objectives.types';

export type ObjectivesAuditMetadata = Omit<
  ObjectivesAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: ObjectivesAuditEntry['outcome'] };

/** Metadata-only audit log: ids, hashes, outcomes. Never titles, labels or values. */
@Injectable()
export class ObjectivesAuditService {
  private readonly entries: ObjectivesAuditEntry[] = [];

  record(metadata: ObjectivesAuditMetadata): void {
    this.entries.push(
      Object.freeze({
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
      }),
    );
  }

  snapshot(tenantId: string): readonly ObjectivesAuditEntry[] {
    return this.entries
      .filter((e) => e.tenantId === tenantId)
      .map((e) => Object.freeze({ ...e }));
  }
}
