import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ScheduleAuditEntry } from './project-schedule-risk.types';

export type ScheduleAuditMetadata = Omit<
  ScheduleAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: ScheduleAuditEntry['outcome'] };

/** Metadata-only audit log: ids, hashes, outcomes. Never titles or dates. */
@Injectable()
export class ScheduleAuditService {
  private readonly entries: ScheduleAuditEntry[] = [];

  record(metadata: ScheduleAuditMetadata): void {
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

  snapshot(tenantId: string): readonly ScheduleAuditEntry[] {
    return this.entries
      .filter((e) => e.tenantId === tenantId)
      .map((e) => Object.freeze({ ...e }));
  }
}
