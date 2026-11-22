import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GovernanceAuditEntry } from './project-governance-export.types';

export type GovernanceAuditMetadata = Omit<
  GovernanceAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: GovernanceAuditEntry['outcome'] };

/** Metadata-only audit log: ids, hashes, outcomes. Never export content or labels. */
@Injectable()
export class GovernanceAuditService {
  private readonly entries: GovernanceAuditEntry[] = [];

  record(metadata: GovernanceAuditMetadata): void {
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

  snapshot(tenantId: string): readonly GovernanceAuditEntry[] {
    return this.entries
      .filter((e) => e.tenantId === tenantId)
      .map((e) => Object.freeze({ ...e }));
  }
}
