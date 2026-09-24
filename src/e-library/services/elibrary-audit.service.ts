import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ELibraryAuditLog,
  ELibraryAuditLogDocument,
  AuditAction,
} from '../schemas/audit-log.schema';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';

export interface RecordAuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  requestId?: string;
  reason?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryFilters {
  actorId?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class ELibraryAuditService {
  constructor(
    @InjectModel(ELibraryAuditLog.name)
    private readonly auditModel: Model<ELibraryAuditLogDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async record(entry: RecordAuditEntry): Promise<ELibraryAuditLogDocument> {
    return this.auditModel.create({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      requestId: entry.requestId ?? null,
      reason: entry.reason ?? null,
      beforeState: entry.beforeState ?? {},
      afterState: entry.afterState ?? {},
      metadata: entry.metadata ?? {},
    });
  }

  async query(filters: AuditQueryFilters, pagination?: PaginationDto) {
    const filter: Record<string, unknown> = {};

    if (filters.actorId) filter.actorId = filters.actorId;
    if (filters.action) filter.action = filters.action;
    if (filters.targetType) filter.targetType = filters.targetType;
    if (filters.targetId) filter.targetId = filters.targetId;

    if (filters.dateFrom || filters.dateTo) {
      filter.timestamp = {};
      if (filters.dateFrom)
        (filter.timestamp as Record<string, Date>).$gte = new Date(
          filters.dateFrom,
        );
      if (filters.dateTo)
        (filter.timestamp as Record<string, Date>).$lte = new Date(
          filters.dateTo,
        );
    }

    if (pagination) {
      return this.paginationService.paginate(this.auditModel, pagination, filter);
    }

    return this.auditModel.find(filter).sort({ timestamp: -1 }).limit(100).exec();
  }

  async getAuditForTarget(
    targetType: string,
    targetId: string,
  ): Promise<ELibraryAuditLogDocument[]> {
    return this.auditModel
      .find({ targetType, targetId })
      .sort({ timestamp: -1 })
      .exec();
  }
}
