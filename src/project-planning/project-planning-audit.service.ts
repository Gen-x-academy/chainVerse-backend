import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlanningAuditEntry } from './project-planning.types';

export type PlanningAuditMetadata = Omit<
  PlanningAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: 'success' | 'denied' };

@Injectable()
export class PlanningAuditService {
  private readonly entries: PlanningAuditEntry[] = [];

  record(metadata: PlanningAuditMetadata): void {
    const entry: PlanningAuditEntry = Object.freeze({
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

  snapshot(): readonly PlanningAuditEntry[] {
    return this.entries.map((entry) => Object.freeze({ ...entry }));
  }
}
