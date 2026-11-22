import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AnalysisSnapshot,
  ScheduleProjectStub,
  TaskRecord,
} from './project-schedule-risk.types';

/** In-memory, tenant-keyed store: a wrong-tenant lookup structurally misses. */
@Injectable()
export class ProjectScheduleRiskRepository {
  private readonly projects = new Map<
    string,
    Map<string, ScheduleProjectStub>
  >();
  private readonly tasks = new Map<string, Map<string, TaskRecord>>();
  private readonly snapshots = new Map<string, AnalysisSnapshot[]>();
  private readonly notified = new Map<string, Set<string>>();

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

  getProject(tenantId: string, id: string): ScheduleProjectStub | undefined {
    return this.bucket(this.projects, tenantId).get(id);
  }
  upsertProject(stub: ScheduleProjectStub): void {
    this.bucket(this.projects, stub.tenantId).set(stub.id, stub);
  }

  putTask(record: TaskRecord): void {
    this.bucket(this.tasks, record.tenantId).set(record.id, record);
  }
  getTask(tenantId: string, id: string): TaskRecord | undefined {
    return this.bucket(this.tasks, tenantId).get(id);
  }
  tasksForProject(tenantId: string, projectId: string): TaskRecord[] {
    return [...this.bucket(this.tasks, tenantId).values()].filter(
      (t) => t.projectId === projectId,
    );
  }

  private key(tenantId: string, projectId: string): string {
    return `${tenantId}|${projectId}`;
  }

  addSnapshot(
    tenantId: string,
    projectId: string,
    snapshot: AnalysisSnapshot,
    max: number,
  ): void {
    const k = this.key(tenantId, projectId);
    const list = this.snapshots.get(k) ?? [];
    list.push(snapshot);
    while (list.length > max) list.shift();
    this.snapshots.set(k, list);
  }
  snapshotsFor(tenantId: string, projectId: string): AnalysisSnapshot[] {
    return [...(this.snapshots.get(this.key(tenantId, projectId)) ?? [])];
  }

  /** Finding keys already notified for a project. */
  notifiedKeys(tenantId: string, projectId: string): Set<string> {
    const k = this.key(tenantId, projectId);
    let set = this.notified.get(k);
    if (!set) {
      set = new Set<string>();
      this.notified.set(k, set);
    }
    return set;
  }
}
