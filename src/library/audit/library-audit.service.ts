import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LibraryAuditLog,
  LibraryAuditLogDocument,
} from './schemas/library-audit-log.schema';

export interface RecordAuditParams {
  actorId: string;
  actorPermission: string;
  targetType: string;
  targetId: string;
  action: string;
  requestId: string;
  reason?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'apiKey', 'privateKey']);

@Injectable()
export class LibraryAuditService {
  constructor(
    @InjectModel(LibraryAuditLog.name)
    private readonly auditModel: Model<LibraryAuditLogDocument>,
  ) {}

  /**
   * Append an immutable audit record for a privileged staff mutation.
   * Sensitive keys in before/after state are automatically redacted.
   */
  async record(params: RecordAuditParams): Promise<void> {
    await this.auditModel.create({
      actorId: params.actorId,
      actorPermission: params.actorPermission,
      targetType: params.targetType,
      targetId: params.targetId,
      action: params.action,
      requestId: params.requestId,
      reason: params.reason ?? null,
      beforeState: params.beforeState
        ? this.redact(params.beforeState)
        : null,
      afterState: params.afterState
        ? this.redact(params.afterState)
        : null,
    });
  }

  /** Retrieve audit logs for a specific target (paginated, newest first). */
  async findByTarget(
    targetType: string,
    targetId: string,
    limit = 20,
    skip = 0,
  ): Promise<LibraryAuditLog[]> {
    return this.auditModel
      .find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private redact(state: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : value;
    }
    return result;
  }
}