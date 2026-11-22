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
import { ConductAuditService } from './capstone-conduct-audit.service';
import { CapstoneConductRepository } from './capstone-conduct.repository';
import {
  ALLOWED_BREACH_TRANSITIONS,
  BreachReferenceRecord,
  BreachReferenceView,
  BreachStatus,
  CONDUCT_ADMIN_ROLES,
  CONDUCT_NOTIFIER,
  ConductAcknowledgementView,
  ConductActor,
  ConductPolicyRecord,
  ConductPolicyStatus,
  ConductPolicyView,
  ConductStanding,
  ConductStatusView,
  ConductTrack,
} from './capstone-conduct.types';
import type { ConductNotifier } from './capstone-conduct.types';
import {
  AcknowledgePolicyDto,
  MutationDto,
  PublishPolicyDto,
  RecordBreachDto,
  TransitionBreachDto,
} from './dto/capstone-conduct.dto';

@Injectable()
export class CapstoneConductService {
  private readonly idempotency = new Map<
    string,
    { fingerprint: string; response: unknown }
  >();
  /** Serialises all state-changing work per tenant so check-then-write sequences are atomic. */
  private readonly tenantLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: CapstoneConductRepository,
    private readonly audit: ConductAuditService,
    @Optional()
    @Inject(CONDUCT_NOTIFIER)
    private readonly notifier?: ConductNotifier,
  ) {}

  // ── Policies ──────────────────────────────────────────────────────────────

  async publishPolicy(
    actorInput: ConductActor | undefined,
    tenantId: string,
    dto: PublishPolicyDto,
  ): Promise<ConductPolicyView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      'policy.publish',
      dto,
      async (actor) => {
        this.assertAdmin(actor);
        if (!dto.title?.trim()) {
          throw new ValidationDomainException('title must not be blank');
        }
        const now = new Date().toISOString();
        for (const existing of this.repository.listPolicies(tenantId)) {
          if (existing.status === ConductPolicyStatus.CURRENT) {
            this.repository.putPolicy({
              ...existing,
              status: ConductPolicyStatus.SUPERSEDED,
              supersededAt: now,
            });
          }
        }
        const record: ConductPolicyRecord = {
          id: this.repository.newId(),
          tenantId,
          version: this.repository.maxPolicyVersion(tenantId) + 1,
          title: dto.title.trim(),
          contentDigest: dto.contentDigest,
          tracks: [...dto.tracks],
          requiresReacknowledgement: dto.requiresReacknowledgement ?? true,
          status: ConductPolicyStatus.CURRENT,
          publishedBy: actor.actorId,
          publishedAt: now,
          supersededAt: null,
        };
        this.repository.putPolicy(record);
        await this.notifyReacknowledgement(actor, record);
        return this.policyView(record);
      },
    );
  }

  getCurrentPolicy(
    actorInput: ConductActor | undefined,
    tenantId: string,
    track: ConductTrack,
  ): ConductPolicyView {
    this.assertActor(actorInput, tenantId);
    const policy = this.currentPolicy(tenantId);
    if (!policy || !policy.tracks.includes(track)) {
      throw new ResourceNotFoundException(
        'No current conduct policy for this track',
        ErrorCode.RES_CONDUCT_POLICY_NOT_FOUND,
      );
    }
    return this.policyView(policy);
  }

  listPolicies(
    actorInput: ConductActor | undefined,
    tenantId: string,
  ): ConductPolicyView[] {
    this.assertAdmin(this.assertActor(actorInput, tenantId));
    return this.repository
      .listPolicies(tenantId)
      .map((p) => this.policyView(p));
  }

  // ── Acknowledgement ───────────────────────────────────────────────────────

  async acknowledge(
    actorInput: ConductActor | undefined,
    tenantId: string,
    dto: AcknowledgePolicyDto,
  ): Promise<ConductAcknowledgementView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      'acknowledgement.create',
      dto,
      (actor) => {
        const policy = this.currentPolicy(tenantId);
        if (!policy || !policy.tracks.includes(dto.track)) {
          throw new BusinessRuleException(
            'The conduct policy does not apply to this track',
            ErrorCode.BIZ_CONDUCT_POLICY_NOT_APPLICABLE,
          );
        }
        if (dto.policyVersion !== policy.version) {
          throw new BusinessRuleException(
            'The conduct policy version is stale; acknowledge the current version',
            ErrorCode.BIZ_CONDUCT_POLICY_STALE,
            { currentVersion: policy.version },
          );
        }
        const id = `${actor.actorId}:${dto.track}:${policy.version}`;
        const existing = this.repository.getAck(tenantId, id);
        if (existing) {
          return this.ackView(existing, false);
        }
        const record = {
          id,
          tenantId,
          userId: actor.actorId,
          track: dto.track,
          policyId: policy.id,
          policyVersion: policy.version,
          acknowledgedAt: new Date().toISOString(),
        };
        this.repository.putAck(record);
        return this.ackView(record, true);
      },
    );
  }

  /** Standing of `userId` (defaults to the caller). Reading another user requires an admin role. */
  getStatus(
    actorInput: ConductActor | undefined,
    tenantId: string,
    track: ConductTrack,
    userId?: string,
  ): ConductStatusView {
    const actor = this.assertActor(actorInput, tenantId);
    const subject = userId?.trim() || actor.actorId;
    if (subject !== actor.actorId) {
      this.assertAdmin(actor);
    }
    return this.computeStatus(tenantId, subject, track);
  }

  /**
   * Enforcement hook for other capstone modules: resolves when the user is
   * compliant on `track` (or no policy applies) and throws otherwise.
   */
  assertCompliant(tenantId: string, userId: string, track: ConductTrack): void {
    const status = this.computeStatus(tenantId, userId, track);
    if (!status.compliant) {
      throw new BusinessRuleException(
        'The current capstone code of conduct must be acknowledged first',
        ErrorCode.BIZ_CONDUCT_ACK_REQUIRED,
        {
          standing: status.standing,
          currentPolicyVersion: status.currentPolicyVersion,
        },
      );
    }
  }

  // ── Breach references (restricted) ────────────────────────────────────────

  async recordBreach(
    actorInput: ConductActor | undefined,
    tenantId: string,
    dto: RecordBreachDto,
  ): Promise<BreachReferenceView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      'breach.record',
      dto,
      (actor) => {
        this.assertAdmin(actor);
        const policy = this.repository
          .listPolicies(tenantId)
          .find((p) => p.version === dto.policyVersion);
        if (!policy) {
          throw new ResourceNotFoundException(
            'Conduct policy version not found',
            ErrorCode.RES_CONDUCT_POLICY_NOT_FOUND,
          );
        }
        if (!policy.tracks.includes(dto.track)) {
          throw new BusinessRuleException(
            'The conduct policy does not apply to this track',
            ErrorCode.BIZ_CONDUCT_POLICY_NOT_APPLICABLE,
          );
        }
        if (this.repository.findBreachByCase(tenantId, dto.caseReference)) {
          throw new ResourceConflictException(
            'A breach reference already exists for this case',
            ErrorCode.RES_ALREADY_EXISTS,
          );
        }
        const now = new Date().toISOString();
        const record: BreachReferenceRecord = {
          id: this.repository.newId(),
          tenantId,
          caseReference: dto.caseReference,
          subjectUserId: dto.subjectUserId.trim(),
          track: dto.track,
          policyVersion: dto.policyVersion,
          severity: dto.severity,
          status: BreachStatus.RECORDED,
          recordedBy: actor.actorId,
          recordedAt: now,
          updatedAt: now,
          resolvedBy: null,
        };
        this.repository.putBreach(record);
        return this.breachView(record);
      },
    );
  }

  async transitionBreach(
    actorInput: ConductActor | undefined,
    tenantId: string,
    breachId: string,
    dto: TransitionBreachDto,
  ): Promise<BreachReferenceView> {
    return this.runIdempotent(
      actorInput,
      tenantId,
      `breach.transition:${breachId}`,
      dto,
      (actor) => {
        this.assertAdmin(actor);
        const record = this.requireBreach(tenantId, breachId);
        if (!ALLOWED_BREACH_TRANSITIONS[record.status].includes(dto.status)) {
          throw new BusinessRuleException(
            `Cannot move a breach reference from ${record.status} to ${dto.status}`,
            ErrorCode.BIZ_CONDUCT_BREACH_INVALID_TRANSITION,
            {
              from: record.status,
              allowed: ALLOWED_BREACH_TRANSITIONS[record.status],
            },
          );
        }
        const terminal = ALLOWED_BREACH_TRANSITIONS[dto.status].length === 0;
        const next: BreachReferenceRecord = {
          ...record,
          status: dto.status,
          updatedAt: new Date().toISOString(),
          resolvedBy: terminal ? actor.actorId : null,
        };
        this.repository.putBreach(next);
        return this.breachView(next);
      },
    );
  }

  getBreach(
    actorInput: ConductActor | undefined,
    tenantId: string,
    breachId: string,
  ): BreachReferenceView {
    this.assertAdmin(this.assertActor(actorInput, tenantId));
    return this.breachView(this.requireBreach(tenantId, breachId));
  }

  listBreaches(
    actorInput: ConductActor | undefined,
    tenantId: string,
  ): BreachReferenceView[] {
    this.assertAdmin(this.assertActor(actorInput, tenantId));
    return this.repository
      .listBreaches(tenantId)
      .map((b) => this.breachView(b));
  }

  getAudit(actorInput: ConductActor | undefined, tenantId: string) {
    this.assertAdmin(this.assertActor(actorInput, tenantId));
    return this.audit.snapshot(tenantId);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private currentPolicy(tenantId: string): ConductPolicyRecord | undefined {
    return this.repository
      .listPolicies(tenantId)
      .find((p) => p.status === ConductPolicyStatus.CURRENT);
  }

  private computeStatus(
    tenantId: string,
    userId: string,
    track: ConductTrack,
  ): ConductStatusView {
    const current = this.currentPolicy(tenantId);
    if (!current || !current.tracks.includes(track)) {
      return {
        userId,
        track,
        standing: ConductStanding.CURRENT,
        currentPolicyVersion: null,
        acknowledgedVersion: null,
        compliant: true, // no policy applies → nothing to enforce
      };
    }
    const acked = this.repository
      .acksForUser(tenantId, userId)
      .filter((a) => a.track === track)
      .map((a) => a.policyVersion);
    const latest = acked.length ? Math.max(...acked) : null;
    let standing: ConductStanding;
    if (latest === null) {
      standing = ConductStanding.NOT_ACKNOWLEDGED;
    } else {
      const mustReack = this.repository
        .listPolicies(tenantId)
        .some(
          (p) =>
            p.version > latest &&
            p.version <= current.version &&
            p.requiresReacknowledgement &&
            p.tracks.includes(track),
        );
      standing = mustReack
        ? ConductStanding.REACKNOWLEDGEMENT_REQUIRED
        : ConductStanding.CURRENT;
    }
    return {
      userId,
      track,
      standing,
      currentPolicyVersion: current.version,
      acknowledgedVersion: latest,
      compliant: standing === ConductStanding.CURRENT,
    };
  }

  private async notifyReacknowledgement(
    actor: ConductActor,
    policy: ConductPolicyRecord,
  ): Promise<void> {
    if (!this.notifier || !policy.requiresReacknowledgement) return;
    try {
      await this.notifier.reacknowledgementRequired({
        tenantId: policy.tenantId,
        policyVersion: policy.version,
        tracks: [...policy.tracks],
      });
    } catch {
      // Dependency failure must not undo the published policy; surface it in the audit trail.
      this.audit.record({
        action: 'policy.notify',
        tenantId: policy.tenantId,
        actorId: actor.actorId,
        actorRoles: actor.roles,
        resourceType: 'policy',
        resourceId: policy.id,
        outcome: 'failed',
        fingerprint: '',
        requestHash: '',
      });
    }
  }

  private requireBreach(tenantId: string, id: string): BreachReferenceRecord {
    const record = this.repository.getBreach(tenantId, id);
    if (!record) {
      throw new ResourceNotFoundException(
        'Breach reference not found',
        ErrorCode.RES_CONDUCT_BREACH_NOT_FOUND,
      );
    }
    return record;
  }

  private assertActor(
    actor: ConductActor | undefined,
    tenantId: string,
  ): ConductActor {
    if (
      !actor?.actorId?.trim() ||
      !actor.tenantId?.trim() ||
      !actor.roles?.length ||
      !tenantId?.trim() ||
      actor.tenantId !== tenantId
    ) {
      throw new ForbiddenDomainException(
        'Conduct access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return actor;
  }

  private assertAdmin(actor: ConductActor): void {
    if (
      !actor.roles.some((r) =>
        (CONDUCT_ADMIN_ROLES as readonly string[]).includes(r),
      )
    ) {
      throw new ForbiddenDomainException(
        'Conduct access denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  /**
   * Idempotent, serialised mutation. Same key + payload replays the stored
   * response; same key + different payload → 409. All mutations in a tenant run
   * one at a time, so concurrent requests cannot duplicate side effects.
   */
  private async runIdempotent<T>(
    actorInput: ConductActor | undefined,
    tenantId: string,
    operation: string,
    payload: MutationDto,
    work: (actor: ConductActor) => T | Promise<T>,
  ): Promise<T> {
    const actor = this.assertActor(actorInput, tenantId);
    const requestHash = hash(
      `${tenantId}|${actor.actorId}|${operation}|${payload.idempotencyKey}`,
    );
    const fingerprint = hash(stableStringify(payload));
    const release = await this.acquire(this.tenantLocks, tenantId);
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

  private async acquire(
    locks: Map<string, Promise<void>>,
    key: string,
  ): Promise<() => void> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    locks.set(key, tail);
    await previous;
    return () => {
      release();
      if (locks.get(key) === tail) locks.delete(key);
    };
  }

  private policyView(p: ConductPolicyRecord): ConductPolicyView {
    return {
      id: p.id,
      version: p.version,
      title: p.title,
      contentDigest: p.contentDigest,
      tracks: [...p.tracks],
      requiresReacknowledgement: p.requiresReacknowledgement,
      status: p.status,
      publishedAt: p.publishedAt,
    };
  }

  private ackView(
    a: {
      id: string;
      userId: string;
      track: ConductTrack;
      policyVersion: number;
      acknowledgedAt: string;
    },
    created: boolean,
  ): ConductAcknowledgementView {
    return {
      id: a.id,
      userId: a.userId,
      track: a.track,
      policyVersion: a.policyVersion,
      acknowledgedAt: a.acknowledgedAt,
      created,
    };
  }

  /** Never exposes recordedBy/resolvedBy — reviewer identity stays inside the audit trail. */
  private breachView(b: BreachReferenceRecord): BreachReferenceView {
    return {
      id: b.id,
      caseReference: b.caseReference,
      subjectUserId: b.subjectUserId,
      track: b.track,
      policyVersion: b.policyVersion,
      severity: b.severity,
      status: b.status,
      recordedAt: b.recordedAt,
      updatedAt: b.updatedAt,
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
