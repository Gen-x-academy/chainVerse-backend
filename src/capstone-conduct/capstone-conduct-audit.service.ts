import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConductAuditEntry } from './capstone-conduct.types';

export type ConductAuditMetadata = Omit<
  ConductAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: ConductAuditEntry['outcome'] };

/**
 * In-memory audit log. Stores identifiers and hashes only — never policy text,
 * breach narratives, evidence, or reporter identity.
 */
@Injectable()
export class ConductAuditService {
  private readonly entries: ConductAuditEntry[] = [];

  record(metadata: ConductAuditMetadata): void {
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

  snapshot(tenantId: string): readonly ConductAuditEntry[] {
    return this.entries
      .filter((e) => e.tenantId === tenantId)
      .map((e) => Object.freeze({ ...e }));
  }
}
