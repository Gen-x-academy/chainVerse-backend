import { randomUUID } from 'node:crypto';
import { ReviewScoreDto, RubricCriterionDto } from './dto/proposal-review.dto';
import { ReviewMode } from './proposal-review.types';

export interface ProposalRecord {
  id: string;
  tenantId: string;
  ownerActorId: string;
  title: string;
  summary: string;
  applicantName: string;
  applicantEmail: string;
  organizationIdentifier: string;
  createdAt: string;
}

export interface QueueRecord {
  id: string;
  tenantId: string;
  name: string;
  reviewMode: ReviewMode;
  rubricId: string;
  allowedReviewerRoles: string[];
  createdBy: string;
  createdAt: string;
}

export interface RubricRecord {
  id: string;
  tenantId: string;
  name: string;
  criteria: RubricCriterionDto[];
  createdAt: string;
}

export interface AssignmentRecord {
  key: string;
  tenantId: string;
  queueId: string;
  proposalId: string;
  reviewerId: string;
  reviewerRoles: string[];
  createdAt: string;
}

export interface RevisionCycleRecord {
  id: string;
  tenantId: string;
  proposalId: string;
  cycleLabel: string;
  round: number;
  open: boolean;
}

export interface ReviewRecord {
  id: string;
  tenantId: string;
  proposalId: string;
  reviewerId: string;
  queueId: string;
  rubricId: string;
  cycleKey: string;
  revisionCycleId?: string;
  scores: ReviewScoreDto[];
  privateNotes?: string;
  weightedScore: number;
  submittedAt: string;
}

export interface IdempotencyRecord {
  key: string;
  operation: string;
  fingerprint: string;
  actorId: string;
  response: unknown;
  at: string;
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  at: string;
}

export interface TenantStore {
  proposals: Map<string, ProposalRecord>;
  queues: Map<string, QueueRecord>;
  rubrics: Map<string, RubricRecord>;
  assignments: Map<string, AssignmentRecord>;
  cycles: Map<string, RevisionCycleRecord>;
  reviews: Map<string, ReviewRecord>;
  idempotency: Map<string, IdempotencyRecord>;
  audit: AuditEntry[];
}

export class ProposalReviewRepository {
  private readonly stores = new Map<string, TenantStore>();
  private readonly locks = new Map<string, Promise<void>>();

  store(tenantId: string): TenantStore {
    let store = this.stores.get(tenantId);
    if (!store) {
      store = {
        proposals: new Map(),
        queues: new Map(),
        rubrics: new Map(),
        assignments: new Map(),
        cycles: new Map(),
        reviews: new Map(),
        idempotency: new Map(),
        audit: [],
      };
      this.stores.set(tenantId, store);
    }
    return store;
  }

  addAudit(
    tenantId: string,
    entry: Omit<AuditEntry, 'id' | 'tenantId' | 'at'>,
  ): AuditEntry {
    const audit: AuditEntry = {
      ...entry,
      id: randomUUID(),
      tenantId,
      at: new Date().toISOString(),
    };
    this.store(tenantId).audit.push(audit);
    return audit;
  }

  auditFor(tenantId: string): AuditEntry[] {
    return [...this.store(tenantId).audit];
  }

  async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => gate);
    this.locks.set(key, chain);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(key) === chain) this.locks.delete(key);
    }
  }
}
