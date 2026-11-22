import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BreachReferenceRecord,
  ConductAcknowledgementRecord,
  ConductPolicyRecord,
} from './capstone-conduct.types';

/**
 * In-memory, tenant-keyed repository. Every store is bucketed by tenantId, so a
 * cross-tenant lookup structurally returns undefined.
 */
@Injectable()
export class CapstoneConductRepository {
  private readonly policies = new Map<
    string,
    Map<string, ConductPolicyRecord>
  >();
  private readonly acks = new Map<
    string,
    Map<string, ConductAcknowledgementRecord>
  >();
  private readonly breaches = new Map<
    string,
    Map<string, BreachReferenceRecord>
  >();

  newId(): string {
    return randomUUID();
  }

  private bucket<T>(store: Map<string, Map<string, T>>, tenantId: string) {
    let entries = store.get(tenantId);
    if (!entries) {
      entries = new Map<string, T>();
      store.set(tenantId, entries);
    }
    return entries;
  }

  // Policies
  putPolicy(record: ConductPolicyRecord): void {
    this.bucket(this.policies, record.tenantId).set(record.id, record);
  }
  getPolicy(tenantId: string, id: string): ConductPolicyRecord | undefined {
    return this.bucket(this.policies, tenantId).get(id);
  }
  listPolicies(tenantId: string): ConductPolicyRecord[] {
    return [...this.bucket(this.policies, tenantId).values()].sort(
      (a, b) => a.version - b.version,
    );
  }
  maxPolicyVersion(tenantId: string): number {
    return this.listPolicies(tenantId).reduce(
      (max, p) => Math.max(max, p.version),
      0,
    );
  }

  // Acknowledgements (keyed by deterministic id → at most one per user/track/version)
  getAck(
    tenantId: string,
    id: string,
  ): ConductAcknowledgementRecord | undefined {
    return this.bucket(this.acks, tenantId).get(id);
  }
  putAck(record: ConductAcknowledgementRecord): void {
    this.bucket(this.acks, record.tenantId).set(record.id, record);
  }
  acksForUser(
    tenantId: string,
    userId: string,
  ): ConductAcknowledgementRecord[] {
    return [...this.bucket(this.acks, tenantId).values()].filter(
      (a) => a.userId === userId,
    );
  }

  // Breach references
  putBreach(record: BreachReferenceRecord): void {
    this.bucket(this.breaches, record.tenantId).set(record.id, record);
  }
  getBreach(tenantId: string, id: string): BreachReferenceRecord | undefined {
    return this.bucket(this.breaches, tenantId).get(id);
  }
  findBreachByCase(
    tenantId: string,
    caseReference: string,
  ): BreachReferenceRecord | undefined {
    return [...this.bucket(this.breaches, tenantId).values()].find(
      (b) => b.caseReference === caseReference,
    );
  }
  listBreaches(tenantId: string): BreachReferenceRecord[] {
    return [...this.bucket(this.breaches, tenantId).values()];
  }
}
