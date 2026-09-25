import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FinanceAuditEvent,
  FinanceAuditEventDocument,
} from '../schemas/finance-audit-event.schema';

export interface AuditInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  reason?: string | null;
  details?: Record<string, unknown>;
}

@Injectable()
export class FinanceAuditService {
  constructor(
    @InjectModel(FinanceAuditEvent.name)
    private readonly auditModel: Model<FinanceAuditEventDocument>,
  ) {}

  async record(input: AuditInput): Promise<void> {
    await this.auditModel.create({
      ...input,
      reason: input.reason ?? null,
      details: input.details ?? {},
    });
  }

  list(
    organizationId: string,
    filter: { entityType?: string; entityId?: string },
    limit = 50,
    skip = 0,
  ) {
    const query: Record<string, unknown> = { organizationId };
    if (filter.entityType) query.entityType = filter.entityType;
    if (filter.entityId) query.entityId = filter.entityId;
    return this.auditModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }
}
