import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DependencyRecord,
  TaskRecord,
  WbsRecord,
  WorkPackageRecord,
} from './work-breakdown.types';

/**
 * In-memory repository for WBS domain data.
 * Follows the same pattern as ProjectPlanningRepository — Map-of-Maps keyed
 * by tenantId, giving O(1) tenant isolation without DB overhead.
 */
@Injectable()
export class WorkBreakdownRepository {
  private readonly wbs = new Map<string, Map<string, WbsRecord>>();
  private readonly packages = new Map<string, Map<string, WorkPackageRecord>>();
  private readonly tasks = new Map<string, Map<string, TaskRecord>>();
  private readonly dependencies = new Map<
    string,
    Map<string, DependencyRecord>
  >();

  newId(): string {
    return randomUUID();
  }

  // ── Generic helpers ──────────────────────────────────────────────────────

  private bucket<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
  ): Map<string, T> {
    let bucket = store.get(tenantId);
    if (!bucket) {
      bucket = new Map<string, T>();
      store.set(tenantId, bucket);
    }
    return bucket;
  }

  private put<T extends { id: string }>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    record: T,
  ): T {
    this.bucket(store, tenantId).set(record.id, record);
    return record;
  }

  private get<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    id: string,
  ): T | undefined {
    return this.bucket(store, tenantId).get(id);
  }

  private list<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
  ): readonly T[] {
    return [...this.bucket(store, tenantId).values()];
  }

  private remove<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    id: string,
  ): boolean {
    return this.bucket(store, tenantId).delete(id);
  }

  // ── WBS ──────────────────────────────────────────────────────────────────

  putWbs(record: WbsRecord): WbsRecord {
    return this.put(this.wbs, record.tenantId, record);
  }

  getWbs(tenantId: string, wbsId: string): WbsRecord | undefined {
    return this.get(this.wbs, tenantId, wbsId);
  }

  wbsByProject(tenantId: string, projectId: string): readonly WbsRecord[] {
    return this.list(this.wbs, tenantId).filter(
      (w) => w.projectId === projectId,
    );
  }

  replaceWbs(record: WbsRecord): void {
    this.put(this.wbs, record.tenantId, record);
  }

  // ── Work Package ──────────────────────────────────────────────────────────

  putPackage(record: WorkPackageRecord): WorkPackageRecord {
    return this.put(this.packages, record.tenantId, record);
  }

  getPackage(tenantId: string, pkgId: string): WorkPackageRecord | undefined {
    return this.get(this.packages, tenantId, pkgId);
  }

  packagesForWbs(
    tenantId: string,
    wbsId: string,
  ): readonly WorkPackageRecord[] {
    return this.list(this.packages, tenantId)
      .filter((p) => p.wbsId === wbsId)
      .sort((a, b) => a.order - b.order);
  }

  replacePackage(record: WorkPackageRecord): void {
    this.put(this.packages, record.tenantId, record);
  }

  // ── Dependency ───────────────────────────────────────────────────────────

  putDependency(record: DependencyRecord): DependencyRecord {
    return this.put(this.dependencies, record.tenantId, record);
  }

  getDependency(
    tenantId: string,
    depId: string,
  ): DependencyRecord | undefined {
    return this.get(this.dependencies, tenantId, depId);
  }

  dependenciesForWbs(
    tenantId: string,
    wbsId: string,
  ): readonly DependencyRecord[] {
    return this.list(this.dependencies, tenantId).filter(
      (d) => d.wbsId === wbsId,
    );
  }

  dependenciesForPackage(
    tenantId: string,
    packageId: string,
  ): readonly DependencyRecord[] {
    return this.list(this.dependencies, tenantId).filter(
      (d) => d.fromPackageId === packageId || d.toPackageId === packageId,
    );
  }

  removeDependency(tenantId: string, depId: string): boolean {
    return this.remove(this.dependencies, tenantId, depId);
  }

  // ── Task ─────────────────────────────────────────────────────────────────

  putTask(record: TaskRecord): TaskRecord {
    return this.put(this.tasks, record.tenantId, record);
  }

  getTask(tenantId: string, taskId: string): TaskRecord | undefined {
    return this.get(this.tasks, tenantId, taskId);
  }

  tasksForPackage(
    tenantId: string,
    packageId: string,
  ): readonly TaskRecord[] {
    return this.list(this.tasks, tenantId).filter(
      (t) => t.packageId === packageId,
    );
  }

  replaceTask(record: TaskRecord): void {
    this.put(this.tasks, record.tenantId, record);
  }
}
