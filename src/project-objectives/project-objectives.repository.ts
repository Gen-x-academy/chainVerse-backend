import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ObjectiveProjectStub,
  ObjectiveRecord,
} from './project-objectives.types';

/** In-memory, tenant-keyed store: a wrong-tenant lookup structurally misses. */
@Injectable()
export class ProjectObjectivesRepository {
  private readonly projects = new Map<
    string,
    Map<string, ObjectiveProjectStub>
  >();
  private readonly objectives = new Map<string, Map<string, ObjectiveRecord>>();

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

  getProject(tenantId: string, id: string): ObjectiveProjectStub | undefined {
    return this.bucket(this.projects, tenantId).get(id);
  }
  upsertProject(stub: ObjectiveProjectStub): void {
    this.bucket(this.projects, stub.tenantId).set(stub.id, stub);
  }

  putObjective(record: ObjectiveRecord): void {
    this.bucket(this.objectives, record.tenantId).set(record.id, record);
  }
  getObjective(tenantId: string, id: string): ObjectiveRecord | undefined {
    return this.bucket(this.objectives, tenantId).get(id);
  }
  objectivesForProject(tenantId: string, projectId: string): ObjectiveRecord[] {
    return [...this.bucket(this.objectives, tenantId).values()].filter(
      (o) => o.projectId === projectId,
    );
  }
}
