import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ELibraryAuditLog,
  AuditLogDocument,
  AuditAction,
} from '../schemas/audit-log.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export enum DigitalAccessOutcome {
  GRANTED = 'granted',
  DENIED = 'denied',
}

export interface DigitalAccessContext {
  patronId: string;
  loanId: string;
  editionId: string;
  renditionId: string;
  requestId?: string;
  technical?: Record<string, unknown>;
}

export interface DigitalAccessAuditFilters {
  patronId?: string;
  loanId?: string;
  editionId?: string;
  renditionId?: string;
  outcome?: DigitalAccessOutcome;
  dateFrom?: string;
  dateTo?: string;
}

const TARGET_LOAN = 'digital_loan';
const TARGET_RENDITION = 'digital_rendition';

const COARSE_TECHNICAL_KEYS = [
  'ipClass',
  'networkType',
  'clientPlatform',
  'userAgentCategory',
  'deviceClass',
  'referrerCategory',
] as const;

@Injectable()
export class DigitalAccessAuditService {
  constructor(
    @InjectModel(ELibraryAuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async recordCheckout(ctx: DigitalAccessContext): Promise<AuditLogDocument> {
    return this.record(ctx, AuditAction.DIGITAL_ACCESS_CHECKOUT, TARGET_LOAN);
  }

  async recordReturn(ctx: DigitalAccessContext): Promise<AuditLogDocument> {
    return this.record(ctx, AuditAction.DIGITAL_ACCESS_RETURN, TARGET_LOAN);
  }

  async recordRevoke(
    ctx: DigitalAccessContext,
    reason?: string,
  ): Promise<AuditLogDocument> {
    return this.record(
      ctx,
      AuditAction.DIGITAL_ACCESS_REVOKE,
      TARGET_LOAN,
      reason,
    );
  }

  async recordGrant(ctx: DigitalAccessContext): Promise<AuditLogDocument> {
    return this.record(ctx, AuditAction.DIGITAL_ACCESS_GRANT, TARGET_RENDITION);
  }

  async recordDenial(
    ctx: DigitalAccessContext,
    reason: string,
  ): Promise<AuditLogDocument> {
    return this.record(ctx, AuditAction.DIGITAL_ACCESS_DENIED, TARGET_RENDITION, reason);
  }

  async queryDigitalAccess(
    filters: DigitalAccessAuditFilters,
    pagination?: PaginationDto,
  ) {
    const filter: Record<string, unknown> = {};

    if (filters.patronId) filter.actorId = filters.patronId;
    if (filters.loanId) filter['metadata.loanId'] = filters.loanId;
    if (filters.editionId) filter['metadata.editionId'] = filters.editionId;
    if (filters.renditionId) filter['metadata.renditionId'] = filters.renditionId;

    if (filters.outcome) {
      if (filters.outcome === DigitalAccessOutcome.GRANTED) {
        filter.action = AuditAction.DIGITAL_ACCESS_GRANT;
      } else if (filters.outcome === DigitalAccessOutcome.DENIED) {
        filter.action = AuditAction.DIGITAL_ACCESS_DENIED;
      } else {
        throw new ValidationDomainException(
          `Unsupported digital access outcome: ${filters.outcome}`,
          ErrorCode.VAL_INVALID_INPUT,
        );
      }
    }

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
      return this.paginationService.paginate(
        this.auditModel,
        pagination,
        filter,
      );
    }

    return this.auditModel.find(filter).sort({ timestamp: -1 }).limit(100).exec();
  }

  async getAuditEntry(auditId: string): Promise<AuditLogDocument> {
    const entry = await this.auditModel.findById(auditId).exec();
    if (!entry) {
      throw new ResourceNotFoundException(
        'Audit entry not found',
        ErrorCode.RES_AUDIT_LOG_NOT_FOUND,
      );
    }
    return entry;
  }

  private async record(
    ctx: DigitalAccessContext,
    action: AuditAction,
    targetType: string,
    reason?: string,
  ): Promise<AuditLogDocument> {
    return this.auditModel.create({
      actorId: ctx.patronId,
      action,
      targetType,
      targetId:
        targetType === TARGET_LOAN ? ctx.loanId : ctx.renditionId,
      requestId: ctx.requestId ?? null,
      reason: reason ?? null,
      metadata: {
        loanId: ctx.loanId,
        editionId: ctx.editionId,
        renditionId: ctx.renditionId,
        ...this.normalizeTechnicalMetadata(ctx.technical),
      },
    });
  }

  private normalizeTechnicalMetadata(
    technical?: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    for (const key of COARSE_TECHNICAL_KEYS) {
      const value = technical?.[key];
      if (value !== undefined) {
        normalized[key] = String(value);
      }
    }
    return normalized;
  }
}