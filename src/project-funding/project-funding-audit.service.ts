import { Injectable } from '@nestjs/common';

export interface ProjectFundingAuditEntry {
  actorId: string;
  actorRole: string;
  tenantId: string;
  action: string;
  entityId: string;
  timestamp: string;
}

@Injectable()
export class ProjectFundingAuditService {
  private readonly entries: ProjectFundingAuditEntry[] = [];

  record(input: Record<string, unknown>): ProjectFundingAuditEntry {
    const entry: ProjectFundingAuditEntry = {
      actorId: this.asString(input['actorId']),
      actorRole: this.asString(input['actorRole']),
      tenantId: this.asString(input['tenantId']),
      action: this.asString(input['action']),
      entityId: this.asString(input['entityId']),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return { ...entry };
  }

  list(): ProjectFundingAuditEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
