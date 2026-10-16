import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { AuditAction, AuditOutcome } from './audit-action.enum';
import { AuditContext } from './audit-context';
import { redactMetadata } from './audit-redaction';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditEntryInput {
  action: AuditAction | string;
  context: AuditContext;
  target: { type: string; id?: string | null };
  outcome?: AuditOutcome;
  /** State before the mutation; redacted before storage. */
  before?: unknown;
  /** State after the mutation; redacted before storage. */
  after?: unknown;
  reason?: string | null;
}

/** Storage-ready audit entry, as written to the collection. */
export interface AuditLogPayload {
  action: string;
  actor: {
    id: string;
    email: string | null;
    role: string | null;
    ip: string | null;
    userAgent: string | null;
  };
  target: { type: string; id: string | null };
  requestId: string;
  timestamp: Date;
  outcome: AuditOutcome;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  integrityHash: string;
}

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    if (isProduction && !this.configService.get<string>('audit.hmacSecret')) {
      // Sharing the key with JWT_SECRET means a JWT rotation silently
      // invalidates the integrity hash of every historical audit entry.
      this.logger.warn(
        'AUDIT_HMAC_SECRET is not set; falling back to JWT_SECRET. ' +
          'Rotating JWT_SECRET will invalidate historical audit integrity hashes. ' +
          'Set a dedicated AUDIT_HMAC_SECRET in production.',
      );
    }
  }

  /**
   * Appends an audit entry.
   *
   * Persistence failures do not propagate by default so an audit outage cannot
   * fail an otherwise successful privileged mutation; set
   * `AUDIT_LOG_FAIL_CLOSED=true` to make the mutation fail instead.
   */
  async record(entry: AuditEntryInput): Promise<AuditLogDocument | null> {
    const payload = this.buildPayload(entry);

    try {
      return await new this.auditLogModel(payload).save();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to persist audit entry action=${payload.action} requestId=${payload.requestId}: ${message}`,
      );
      if (this.failClosed) {
        throw err;
      }
      return null;
    }
  }

  /** Builds the storage-ready entry, including its integrity hash. */
  buildPayload(entry: AuditEntryInput): AuditLogPayload {
    const { context } = entry;
    const timestamp = new Date();

    const base = {
      action: entry.action,
      actor: {
        id: context.actorId,
        email: context.actorEmail,
        role: context.actorRole,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      target: {
        type: entry.target.type,
        id: entry.target.id ?? null,
      },
      requestId: context.requestId,
      timestamp,
      outcome: entry.outcome ?? AuditOutcome.SUCCESS,
      before: (redactMetadata(entry.before ?? null) ?? null) as Record<
        string,
        unknown
      > | null,
      after: (redactMetadata(entry.after ?? null) ?? null) as Record<
        string,
        unknown
      > | null,
      reason: entry.reason ?? null,
    };

    return { ...base, integrityHash: this.computeIntegrityHash(base) };
  }

  /**
   * HMAC over the canonical (key-sorted) entry. Any later edit to a stored row
   * makes the recomputed hash diverge, which {@link verify} reports.
   */
  computeIntegrityHash(entry: Record<string, unknown>): string {
    // The hash never covers itself.
    const rest = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== 'integrityHash'),
    );
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(canonicalize(rest))
      .digest('hex');
  }

  /** Returns true when the stored entry still matches its integrity hash. */
  verify(entry: Partial<AuditLog>): boolean {
    if (!entry?.integrityHash) return false;
    const plain =
      typeof (entry as { toObject?: () => AuditLog }).toObject === 'function'
        ? (entry as { toObject: () => AuditLog }).toObject()
        : entry;

    const {
      action,
      actor,
      target,
      requestId,
      timestamp,
      outcome,
      before,
      after,
      reason,
    } = plain as AuditLog;

    const expected = this.computeIntegrityHash({
      action,
      actor,
      target,
      requestId,
      timestamp,
      outcome,
      before: before ?? null,
      after: after ?? null,
      reason: reason ?? null,
    });

    const stored = Buffer.from(entry.integrityHash);
    const candidate = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, which itself means tampering.
    return (
      stored.length === candidate.length &&
      crypto.timingSafeEqual(candidate, stored)
    );
  }

  private get hmacSecret(): string {
    return (
      this.configService.get<string>('audit.hmacSecret') ??
      this.configService.get<string>('jwtSecret') ??
      'chainverse-audit-development-secret'
    );
  }

  private get failClosed(): boolean {
    return this.configService.get<boolean>('audit.failClosed') === true;
  }
}

/**
 * Deterministic JSON with sorted keys, so hash stability does not depend on
 * property insertion order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => typeof entryValue !== 'undefined')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${canonicalize(entryValue)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
