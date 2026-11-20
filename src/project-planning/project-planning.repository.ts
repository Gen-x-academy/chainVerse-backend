import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CheckInRecord,
  ExtensionRequestRecord,
  ObjectiveRecord,
  PhaseRecord,
  ProjectRecord,
  RiskRecord,
} from './project-planning.types';

@Injectable()
export class ProjectPlanningRepository {
  private readonly projects = new Map<string, Map<string, ProjectRecord>>();
  private readonly objectives = new Map<string, Map<string, ObjectiveRecord>>();
  private readonly checkIns = new Map<string, Map<string, CheckInRecord>>();
  private readonly risks = new Map<string, Map<string, RiskRecord>>();
  private readonly phases = new Map<string, Map<string, PhaseRecord>>();
  private readonly extensions = new Map<
    string,
    Map<string, ExtensionRequestRecord>
  >();

  newId(): string {
    return randomUUID();
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

  projectsByTenant(tenantId: string): readonly ProjectRecord[] {
    return this.list(this.projects, tenantId);
  }

  getProject(tenantId: string, projectId: string): ProjectRecord | undefined {
    return this.get(this.projects, tenantId, projectId);
  }

  putProject(record: ProjectRecord): ProjectRecord {
    return this.put(this.projects, record.tenantId, record);
  }

  replaceProject(record: ProjectRecord): void {
    this.replace(this.projects, record.tenantId, record);
  }

  getObjective(
    tenantId: string,
    objectiveId: string,
  ): ObjectiveRecord | undefined {
    return this.get(this.objectives, tenantId, objectiveId);
  }

  putObjective(record: ObjectiveRecord): ObjectiveRecord {
    return this.put(this.objectives, record.tenantId, record);
  }

  objectivesForProject(
    tenantId: string,
    projectId: string,
  ): readonly ObjectiveRecord[] {
    return this.list(this.objectives, tenantId).filter(
      (objective) => objective.projectId === projectId,
    );
  }

  putCheckIn(record: CheckInRecord): CheckInRecord {
    return this.put(this.checkIns, record.tenantId, record);
  }

  checkInsForObjective(
    tenantId: string,
    objectiveId: string,
  ): readonly CheckInRecord[] {
    return this.list(this.checkIns, tenantId)
      .filter((entry) => entry.objectiveId === objectiveId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  putRisk(record: RiskRecord): RiskRecord {
    return this.put(this.risks, record.tenantId, record);
  }

  getRisk(tenantId: string, riskId: string): RiskRecord | undefined {
    return this.get(this.risks, tenantId, riskId);
  }

  risksForProject(tenantId: string, projectId: string): readonly RiskRecord[] {
    return this.list(this.risks, tenantId).filter(
      (entry) => entry.projectId === projectId,
    );
  }

  putPhase(record: PhaseRecord): PhaseRecord {
    return this.put(this.phases, record.tenantId, record);
  }

  phasesForProject(
    tenantId: string,
    projectId: string,
  ): readonly PhaseRecord[] {
    return this.list(this.phases, tenantId)
      .filter((entry) => entry.projectId === projectId)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  putExtension(record: ExtensionRequestRecord): ExtensionRequestRecord {
    return this.put(this.extensions, record.tenantId, record);
  }

  getExtension(
    tenantId: string,
    requestId: string,
  ): ExtensionRequestRecord | undefined {
    return this.get(this.extensions, tenantId, requestId);
  }

  replaceExtension(record: ExtensionRequestRecord): void {
    this.replace(this.extensions, record.tenantId, record);
  }

  extensionsForProject(
    tenantId: string,
    projectId: string,
  ): readonly ExtensionRequestRecord[] {
    return this.list(this.extensions, tenantId).filter(
      (entry) => entry.projectId === projectId,
    );
  }

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
}
