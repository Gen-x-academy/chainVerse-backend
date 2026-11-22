import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { GovernanceAuditService } from './project-governance-export-audit.service';
import { ProjectGovernanceExportRepository } from './project-governance-export.repository';
import {
  EXPORT_TTL_MS,
  ExportStatus,
  ExportedGovernanceEntry,
  GOVERNANCE_ADMIN_ROLES,
  GOVERNANCE_FINANCE_SOURCE,
  GOVERNANCE_MILESTONE_SOURCE,
  GOVERNANCE_WRITE_ROLES,
  GovernanceActor,
  GovernanceExportContent,
  GovernanceExportDownload,
  GovernanceExportRecord,
  GovernanceExportView,
  GovernanceProjectRole,
  GovernanceProjectStub,
  GovernanceRecordEntry,
  GovernanceRecordKind,
  GovernanceRecordView,
  MAX_ACTIVE_EXPORTS_PER_REQUESTER,
  MembershipSummary,
  SectionResult,
} from './project-governance-export.types';
import type {
  GovernanceFinanceSource,
  GovernanceMilestoneSource,
} from './project-governance-export.types';
import {
  MutationDto,
  RecordGovernanceEntryDto,
  RequestExportDto,
  RevokeExportDto,
} from './dto/project-governance-export.dto';

const SOURCE_TIMEOUT_MS = 5_000;

@Injectable()
export class ProjectGovernanceExportService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  /** Serialises state-changing work per tenant so check-then-write sequences are atomic. */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ProjectGovernanceExportRepository,
    private readonly audit: GovernanceAuditService,
    @Optional()
    @Inject(GOVERNANCE_MILESTONE_SOURCE)
    private readonly milestoneSource?: GovernanceMilestoneSource,
    @Optional()
    @Inject(GOVERNANCE_FINANCE_SOURCE)
    private readonly financeSource?: GovernanceFinanceSource,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  registerProject(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    stub: GovernanceProjectStub,
  ): void {
    const actor = this.assertActor(actorInput, tenantId);
    if (!stub.id?.trim()) {
      throw new ValidationDomainException('projectId is required');
    }
    for (const [userId, role] of Object.entries(stub.members ?? {})) {
      if (
        !userId.trim() ||
        !Object.values(GovernanceProjectRole).includes(role)
      ) {
        throw new ValidationDomainException(
          'members must be a map of user IDs to valid project roles',
        );
      }
    }
    const existing = this.repository.getProject(tenantId, stub.id);
    if (existing) {
      this.assertProjectAccess(existing, actor, GOVERNANCE_WRITE_ROLES);
    } else if (!this.isPlatformAdmin(actor)) {
      throw this.denied();
    }
    this.repository.upsertProject(stub);
  }

  // ── Governance ledger ─────────────────────────────────────────────────────

  async recordEntry(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    projectId: string,
    dto: RecordGovernanceEntryDto,
  ): Promise<GovernanceRecordView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `record.create:${projectId}`,
      dto,
      (actor) => {
        const project = this.requireProject(tenantId, projectId);
        this.assertProjectAccess(project, actor, GOVERNANCE_WRITE_ROLES);
        if (!dto.label?.trim()) {
          throw new ValidationDomainException('label must not be blank');
        }
        const existing = this.repository.recordsForProject(tenantId, projectId);
        if (
          existing.some(
            (r) => r.kind === dto.kind && r.reference === dto.reference,
          )
        ) {
          throw new ResourceConflictException(
            'This governance record already exists for the project',
            ErrorCode.BIZ_GOVERNANCE_RECORD_DUPLICATE,
          );
        }
        this.assertTarget(existing, dto);
        const record: GovernanceRecordEntry = {
          id: this.repository.newId(),
          tenantId,
          projectId,
          kind: dto.kind,
          reference: dto.reference,
          targetReference: dto.targetReference ?? null,
          label: dto.label.trim(),
          recordedBy: actor.actorId,
          recordedAt: new Date().toISOString(),
        };
        this.repository.putRecord(record);
        return {
          id: record.id,
          projectId,
          kind: record.kind,
          reference: record.reference,
          targetReference: record.targetReference,
          label: record.label,
          recordedAt: record.recordedAt,
        };
      },
    );
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  async requestExport(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    projectId: string,
    dto: RequestExportDto,
  ): Promise<GovernanceExportView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `export.create:${projectId}`,
      dto,
      async (actor) => {
        const project = this.requireProject(tenantId, projectId);
        this.assertProjectAccess(project, actor);
        const now = Date.now();
        const active = this.repository
          .exportsForRequester(tenantId, actor.actorId)
          .filter((e) => this.isActive(e, now));
        if (active.length >= MAX_ACTIVE_EXPORTS_PER_REQUESTER) {
          throw new BusinessRuleException(
            'Too many active governance exports; revoke one or wait for it to expire',
            ErrorCode.BIZ_GOVERNANCE_EXPORT_LIMIT,
            { limit: MAX_ACTIVE_EXPORTS_PER_REQUESTER },
          );
        }
        const milestones = await this.fromSource(
          this.milestoneSource,
          tenantId,
          projectId,
          actor,
        );
        const financials = await this.fromSource(
          this.financeSource,
          tenantId,
          projectId,
          actor,
        );
        const generatedAt = new Date(now).toISOString();
        const content: GovernanceExportContent = {
          projectId,
          generatedAt,
          ...this.ledgerSections(tenantId, project, actor),
          membership: this.membership(project, actor),
          milestones,
          financials,
        };
        const record: GovernanceExportRecord = {
          id: this.repository.newId(),
          tenantId,
          projectId,
          requesterId: actor.actorId,
          status: ExportStatus.READY,
          partial: !milestones.available || !financials.available,
          contentDigest: hash(stableStringify(content)),
          content,
          createdAt: generatedAt,
          expiresAt: new Date(now + EXPORT_TTL_MS).toISOString(),
          revokedAt: null,
        };
        this.repository.putExport(record);
        return this.exportView(record);
      },
    );
  }

  /** Content is returned only to the requester or a platform admin, and only while READY and unexpired. */
  getExport(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    exportId: string,
  ): GovernanceExportDownload | GovernanceExportView {
    const actor = this.assertActor(actorInput, tenantId);
    const record = this.requireExport(actor, tenantId, exportId);
    if (record.status === ExportStatus.REVOKED || !record.content) {
      return this.exportView(record);
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      throw new BusinessRuleException(
        'The governance export has expired; request a new one',
        ErrorCode.BIZ_GOVERNANCE_EXPORT_EXPIRED,
      );
    }
    return { ...this.exportView(record), content: clone(record.content) };
  }

  async revokeExport(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    exportId: string,
    dto: RevokeExportDto,
  ): Promise<GovernanceExportView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `export.revoke:${exportId}`,
      dto,
      (actor) => {
        const record = this.requireExport(actor, tenantId, exportId);
        if (record.status === ExportStatus.REVOKED) {
          throw new BusinessRuleException(
            'The governance export is already revoked',
            ErrorCode.BIZ_GOVERNANCE_EXPORT_INVALID_TRANSITION,
            { status: record.status },
          );
        }
        if (Date.parse(record.expiresAt) <= Date.now()) {
          throw new BusinessRuleException(
            'The governance export has expired',
            ErrorCode.BIZ_GOVERNANCE_EXPORT_EXPIRED,
          );
        }
        const next: GovernanceExportRecord = {
          ...record,
          status: ExportStatus.REVOKED,
          content: null,
          revokedAt: new Date().toISOString(),
        };
        this.repository.putExport(next);
        return this.exportView(next);
      },
    );
  }

  getAudit(actorInput: GovernanceActor | undefined, tenantId: string) {
    const actor = this.assertActor(actorInput, tenantId);
    if (!this.isPlatformAdmin(actor)) throw this.denied();
    return this.audit.snapshot(tenantId);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertTarget(
    existing: GovernanceRecordEntry[],
    dto: RecordGovernanceEntryDto,
  ): void {
    const has = (kind: GovernanceRecordKind, reference?: string) =>
      existing.some((r) => r.kind === kind && r.reference === reference);
    switch (dto.kind) {
      case GovernanceRecordKind.TERMS_ACCEPTANCE:
        if (dto.targetReference) {
          throw new ValidationDomainException(
            'terms_acceptance must not carry a targetReference',
          );
        }
        return;
      case GovernanceRecordKind.AMENDMENT:
        if (!has(GovernanceRecordKind.TERMS_ACCEPTANCE, dto.targetReference)) {
          throw new BusinessRuleException(
            'An amendment must target accepted terms',
            ErrorCode.BIZ_GOVERNANCE_TARGET_MISSING,
          );
        }
        return;
      case GovernanceRecordKind.APPROVAL:
        if (
          !has(GovernanceRecordKind.TERMS_ACCEPTANCE, dto.targetReference) &&
          !has(GovernanceRecordKind.AMENDMENT, dto.targetReference)
        ) {
          throw new BusinessRuleException(
            'An approval must target accepted terms or an amendment',
            ErrorCode.BIZ_GOVERNANCE_TARGET_MISSING,
          );
        }
    }
  }

  private ledgerSections(
    tenantId: string,
    project: GovernanceProjectStub,
    viewer: GovernanceActor,
  ) {
    const records = this.repository.recordsForProject(tenantId, project.id);
    const toEntry = (r: GovernanceRecordEntry): ExportedGovernanceEntry => ({
      reference: r.reference,
      targetReference: r.targetReference,
      label: r.label,
      recordedAt: r.recordedAt,
      recordedByRole: project.members[r.recordedBy] ?? 'platform',
      byYou: r.recordedBy === viewer.actorId,
    });
    const of = (kind: GovernanceRecordKind) =>
      records.filter((r) => r.kind === kind).map(toEntry);
    return {
      acceptedTerms: of(GovernanceRecordKind.TERMS_ACCEPTANCE),
      amendments: of(GovernanceRecordKind.AMENDMENT),
      approvals: of(GovernanceRecordKind.APPROVAL),
    };
  }

  /** Counts and roles only — no other participant's id leaves the service. */
  private membership(
    project: GovernanceProjectStub,
    viewer: GovernanceActor,
  ): MembershipSummary {
    const byRole: MembershipSummary['byRole'] = {};
    for (const role of Object.values(project.members)) {
      byRole[role] = (byRole[role] ?? 0) + 1;
    }
    return {
      total: Object.keys(project.members).length,
      byRole,
      yourRole: project.members[viewer.actorId] ?? null,
    };
  }

  private async fromSource<T>(
    source:
      | {
          summarize(input: {
            tenantId: string;
            projectId: string;
            actor: GovernanceActor;
          }): Promise<T>;
        }
      | undefined,
    tenantId: string,
    projectId: string,
    actor: GovernanceActor,
  ): Promise<SectionResult<T>> {
    if (!source) {
      return { available: false, reason: 'source_not_configured' };
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const data = await Promise.race([
        source.summarize({ tenantId, projectId, actor }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('source timeout')),
            SOURCE_TIMEOUT_MS,
          );
        }),
      ]);
      return { available: true, data };
    } catch {
      this.audit.record({
        action: 'export.source',
        tenantId,
        actorId: actor.actorId,
        actorRoles: actor.roles,
        resourceType: 'export',
        resourceId: projectId,
        outcome: 'failed',
        fingerprint: '',
        requestHash: '',
      });
      return { available: false, reason: 'source_failed' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private isActive(e: GovernanceExportRecord, now: number): boolean {
    return e.status === ExportStatus.READY && Date.parse(e.expiresAt) > now;
  }

  private requireProject(
    tenantId: string,
    projectId: string,
  ): GovernanceProjectStub {
    const project = this.repository.getProject(tenantId, projectId);
    if (!project) {
      throw new ResourceNotFoundException(
        'Project not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return project;
  }

  /** Not-found for strangers: a non-owner cannot learn that someone else's export exists. */
  private requireExport(
    actor: GovernanceActor,
    tenantId: string,
    exportId: string,
  ): GovernanceExportRecord {
    const record = this.repository.getExport(tenantId, exportId);
    if (
      !record ||
      (record.requesterId !== actor.actorId && !this.isPlatformAdmin(actor))
    ) {
      throw new ResourceNotFoundException(
        'Governance export not found',
        ErrorCode.RES_GOVERNANCE_EXPORT_NOT_FOUND,
      );
    }
    return record;
  }

  private assertActor(
    actor: GovernanceActor | undefined,
    tenantId: string,
  ): GovernanceActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim() ||
      actor.tenantId !== tenantId
    ) {
      throw this.denied();
    }
    return actor;
  }

  private assertProjectAccess(
    project: GovernanceProjectStub,
    actor: GovernanceActor,
    allowed?: readonly GovernanceProjectRole[],
  ): void {
    const role = project.members[actor.actorId] as
      | GovernanceProjectRole
      | undefined;
    if (role && (!allowed || allowed.includes(role))) return;
    if (this.isPlatformAdmin(actor)) return;
    throw this.denied();
  }

  private isPlatformAdmin(actor: GovernanceActor): boolean {
    return actor.roles.some((r) =>
      (GOVERNANCE_ADMIN_ROLES as readonly string[]).includes(r),
    );
  }

  private denied(): ForbiddenDomainException {
    return new ForbiddenDomainException(
      'Governance access denied',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  private async runIdempotent<T>(
    actorInput: GovernanceActor | undefined,
    tenantId: string,
    operation: string,
    payload: MutationDto,
    work: (actor: GovernanceActor) => T | Promise<T>,
  ): Promise<T> {
    const actor = this.assertActor(actorInput, tenantId);
    const requestHash = hash(
      `${tenantId}|${actor.actorId}|${operation}|${payload.idempotencyKey}`,
    );
    const fingerprint = hash(stableStringify(payload));
    const release = await this.acquire(tenantId);
    try {
      const cached = this.idempotency.get(requestHash);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new ResourceConflictException(
            'Idempotency key reused with a different payload',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return clone(cached.response) as T;
      }
      let response: T;
      try {
        response = await work(actor);
      } catch (error) {
        this.audit.record({
          action: operation,
          tenantId,
          actorId: actor.actorId,
          actorRoles: actor.roles,
          resourceType: operation.split('.')[0],
          resourceId: '',
          outcome:
            error instanceof ForbiddenDomainException ? 'denied' : 'failed',
          fingerprint,
          requestHash,
        });
        throw error;
      }
      this.idempotency.set(requestHash, {
        fingerprint,
        response: clone(response),
      });
      this.audit.record({
        action: operation,
        tenantId,
        actorId: actor.actorId,
        actorRoles: actor.roles,
        resourceType: operation.split('.')[0],
        resourceId: resourceIdOf(response),
        fingerprint,
        requestHash,
      });
      return response;
    } finally {
      release();
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.tenantLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.tenantLocks.set(key, tail);
    await previous;
    return () => {
      release();
      if (this.tenantLocks.get(key) === tail) this.tenantLocks.delete(key);
    };
  }

  private exportView(r: GovernanceExportRecord): GovernanceExportView {
    return {
      id: r.id,
      projectId: r.projectId,
      status: r.status,
      partial: r.partial,
      contentDigest: r.contentDigest,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceIdOf(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) {
    return String(value.id);
  }
  return '';
}
