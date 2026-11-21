import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MilestoneAuditEntry } from './project-milestones.types';

export type MilestoneAuditMetadata = Omit<
  MilestoneAuditEntry,
  'id' | 'timestamp' | 'outcome'
> & { outcome?: 'success' | 'denied' };

/**
 * Lightweight in-memory audit log for the milestones domain.
 *
 * Stores metadata only — action, tenantId, actorId, actorRoles, resourceType,
 * resourceId, outcome, fingerprint, requestHash and timestamp. Private content
 * (descriptions, criteria, deliverables, reasons) is never recorded here.
 */
@Injectable()
export class MilestonesAuditService {
  private readonly entries: MilestoneAuditEntry[] = [];

  record(metadata: MilestoneAuditMetadata): void {
    const entry: MilestoneAuditEntry = Object.freeze({
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

  snapshot(): readonly MilestoneAuditEntry[] {
    return this.entries.map((entry) => Object.freeze({ ...entry }));
  }
}
