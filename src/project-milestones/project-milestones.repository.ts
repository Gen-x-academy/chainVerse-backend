import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MilestoneProjectStub, MilestoneRecord } from './project-milestones.types';

/**
 * In-memory, tenant-keyed repository for the project milestones domain.
 *
 * All stores are keyed by tenantId → id, so cross-tenant reads are structurally
 * impossible (a lookup in the wrong tenant's bucket simply returns undefined).
 * Data survives only for the lifetime of the process; this is intentional for
 * CAPSTONE modules where persistence is handled upstream.
 */
@Injectable()
export class ProjectMilestonesRepository {
  private readonly milestones = new Map<string, Map<string, MilestoneRecord>>();
  /**
   * Lightweight project stubs so the milestones service can resolve membership
   * and enforce tenant boundaries without depending on the full project-planning
   * module. Stubs are upserted by callers that have already validated the
   * project.
   */
  private readonly projects = new Map<string, Map<string, MilestoneProjectStub>>();

  newId(): string {
    return randomUUID();
  }

  // ── Generic helpers ───────────────────────────────────────────────────────

  private bucket<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
  ): Map<string, T> {
    let entries = store.get(tenantId);
    if (!entries) {
      entries = new Map<string, T>();
      store.set(tenantId, entries);
    }
    return entries;
  }

  put<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    record: T & { id: string },
  ): T {
    this.bucket(store, tenantId).set(record.id, record);
    return record;
  }

  get<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    id: string,
  ): T | undefined {
    return this.bucket(store, tenantId).get(id);
  }

  list<T>(store: Map<string, Map<string, T>>, tenantId: string): readonly T[] {
    return [...this.bucket(store, tenantId).values()];
  }

  replace<T extends { id: string }>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    record: T,
  ): void {
    this.bucket(store, tenantId).set(record.id, record);
  }

  // ── Milestone-specific helpers ────────────────────────────────────────────

  getMilestone(tenantId: string, milestoneId: string): MilestoneRecord | undefined {
    return this.get(this.milestones, tenantId, milestoneId);
  }

  putMilestone(record: MilestoneRecord): MilestoneRecord {
    return this.put(this.milestones, record.tenantId, record);
  }

  replaceMilestone(record: MilestoneRecord): void {
    this.replace(this.milestones, record.tenantId, record);
  }

  milestonesForProject(
    tenantId: string,
    projectId: string,
  ): readonly MilestoneRecord[] {
    return this.list(this.milestones, tenantId)
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  /** Returns the highest sequence number already in use for a project, or 0. */
  maxSequenceForProject(tenantId: string, projectId: string): number {
    const all = this.milestonesForProject(tenantId, projectId);
    return all.reduce((max, m) => Math.max(max, m.sequence), 0);
  }

  // ── Project stub helpers ──────────────────────────────────────────────────

  getProject(tenantId: string, projectId: string): MilestoneProjectStub | undefined {
    return this.get(this.projects, tenantId, projectId);
  }

  upsertProject(stub: MilestoneProjectStub): void {
    this.bucket(this.projects, stub.tenantId).set(stub.id, stub);
  }
}
