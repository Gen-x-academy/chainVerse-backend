import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GovernanceExportRecord,
  GovernanceProjectStub,
  GovernanceRecordEntry,
} from './project-governance-export.types';

/** In-memory, tenant-keyed store: a wrong-tenant lookup structurally misses. */
@Injectable()
export class ProjectGovernanceExportRepository {
  private readonly projects = new Map<
    string,
    Map<string, GovernanceProjectStub>
  >();
  private readonly records = new Map<
    string,
    Map<string, GovernanceRecordEntry>
  >();
  private readonly exports = new Map<
    string,
    Map<string, GovernanceExportRecord>
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

  getProject(tenantId: string, id: string): GovernanceProjectStub | undefined {
    return this.bucket(this.projects, tenantId).get(id);
  }
  upsertProject(stub: GovernanceProjectStub): void {
    this.bucket(this.projects, stub.tenantId).set(stub.id, stub);
  }

  putRecord(record: GovernanceRecordEntry): void {
    this.bucket(this.records, record.tenantId).set(record.id, record);
  }
  recordsForProject(
    tenantId: string,
    projectId: string,
  ): GovernanceRecordEntry[] {
    return [...this.bucket(this.records, tenantId).values()]
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  putExport(record: GovernanceExportRecord): void {
    this.bucket(this.exports, record.tenantId).set(record.id, record);
  }
  getExport(tenantId: string, id: string): GovernanceExportRecord | undefined {
    return this.bucket(this.exports, tenantId).get(id);
  }
  exportsForProject(
    tenantId: string,
    projectId: string,
  ): GovernanceExportRecord[] {
    return [...this.bucket(this.exports, tenantId).values()].filter(
      (e) => e.projectId === projectId,
    );
  }
  exportsForRequester(
    tenantId: string,
    requesterId: string,
  ): GovernanceExportRecord[] {
    return [...this.bucket(this.exports, tenantId).values()].filter(
      (e) => e.requesterId === requesterId,
    );
  }
}
