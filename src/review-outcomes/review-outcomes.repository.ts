import { Injectable } from '@nestjs/common';
import {
  AuditEntry,
  DeliverableRecord,
  DeliverableReviewRecord,
  IdempotencyRecord,
  OutcomeRecord,
  ProposalRecord,
  ReviewRecord,
  RevisionRequestRecord,
} from './review-outcomes.types';

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export class TenantStore<T> {
  private readonly entries = new Map<string, Map<string, T>>();

  put(tenantId: string, id: string, value: T): void {
    const tenant = this.entries.get(tenantId) ?? new Map<string, T>();
    tenant.set(id, value);
    this.entries.set(tenantId, tenant);
  }

  get(tenantId: string, id: string): T | undefined {
    return this.entries.get(tenantId)?.get(id);
  }

  values(tenantId: string): T[] {
    return Array.from(this.entries.get(tenantId)?.values() ?? []);
  }
}

export class TenantLock {
  private readonly chains = new Map<string, Promise<unknown>>();

  async runExclusive<T>(
    tenantId: string,
    work: () => Promise<T> | T,
  ): Promise<T> {
    const previous = this.chains.get(tenantId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => gate);
    this.chains.set(tenantId, chain);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.chains.get(tenantId) === chain) {
        this.chains.delete(tenantId);
      }
    }
  }
}

@Injectable()
export class ReviewOutcomesRepository {
  readonly lock = new TenantLock();
  readonly proposals = new TenantStore<ProposalRecord>();
  readonly reviews = new TenantStore<ReviewRecord>();
  readonly outcomes = new TenantStore<OutcomeRecord>();
  readonly revisionRequests = new TenantStore<RevisionRequestRecord>();
  readonly deliverables = new TenantStore<DeliverableRecord>();
  readonly deliverableReviews = new TenantStore<DeliverableReviewRecord>();
  readonly idempotency = new TenantStore<IdempotencyRecord>();

  private readonly auditEntries: AuditEntry[] = [];

  addAudit(entry: AuditEntry): void {
    this.auditEntries.push(clone(entry));
  }

  listAudit(tenantId: string): AuditEntry[] {
    return clone(
      this.auditEntries.filter((entry) => entry.tenantId === tenantId),
    );
  }
}
