import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipAuditEvent,
  MentorshipAuditEventDocument,
} from './mentorship-audit-event.schema';
import { MentorshipRequestContext } from '../mentorship-context';
import { MentorshipTelemetry } from '../mentorship-telemetry.service';

export interface AuditEntry {
  action: string;
  programId?: string | null;
  subjectType: 'program' | 'form_version' | 'rule_set' | 'application' | 'reviewer';
  subjectId: string;
  metadata?: Record<string, unknown>;
  /** Supply for operations that may be retried so the row is written once. */
  dedupeKey?: string;
}

@Injectable()
export class MentorshipAuditService {
  constructor(
    @InjectModel(MentorshipAuditEvent.name)
    private readonly auditModel: Model<MentorshipAuditEventDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /**
   * Records an audit row. Audit writes happen after the state change has
   * committed; a failure here is logged and counted but does not undo the
   * user's action (the state change is the source of truth, and the
   * `mentorship_audit_write_failures_total` alert covers gaps).
   */
  async record(ctx: MentorshipRequestContext, entry: AuditEntry): Promise<void> {
    try {
      await this.auditModel.create({
        action: entry.action,
        actorId: ctx.user.id,
        actorRole: String(ctx.user.role),
        programId: entry.programId ?? null,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        requestId: ctx.requestId ?? null,
        dedupeKey: entry.dedupeKey,
        metadata: entry.metadata ?? {},
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return; // retried op, already audited
      this.telemetry.count('mentorship_audit_write_failures_total', { action: entry.action });
      this.telemetry.warn('mentorship.audit.write_failed', {
        action: entry.action,
        subjectId: entry.subjectId,
        error: (err as Error).message,
      });
    }
  }

  async listForSubject(subjectType: string, subjectId: string, limit = 100) {
    return this.auditModel
      .find({ subjectType, subjectId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean()
      .exec();
  }
}
