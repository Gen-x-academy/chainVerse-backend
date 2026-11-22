import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { ErrorCode, ResourceNotFoundException, ValidationDomainException } from '../../common/errors';
import { stableStringify } from '../forms/domain/form-definition.validator';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { conflict, staleVersion } from '../shared/mentorship-errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { CapacityAccessPolicy } from './capacity-access.policy';
import {
  CapacityScope,
  MAX_RESERVATION_TTL_MS,
  ReservationStatus,
  scopeKeyFor,
} from './capacity.constants';
import {
  DefineCapacityPolicyDto,
  ExpireReservationsDto,
  InspectAllocationQueryDto,
  ReserveCapacityDto,
} from './dto/capacity.dto';
import {
  CapacityAllocation,
  CapacityAllocationDocument,
} from './schemas/capacity-allocation.schema';
import {
  CapacityPolicy,
  CapacityPolicyDocument,
} from './schemas/capacity-policy.schema';
import {
  CapacityReservation,
  CapacityReservationDocument,
} from './schemas/capacity-reservation.schema';

type PolicyRecord = Pick<
  CapacityPolicy,
  | 'scopeKey'
  | 'scope'
  | 'targetId'
  | 'version'
  | 'contentHash'
  | 'maxConcurrentEngagements'
  | 'maxWeeklyHours'
  | 'maxPrograms'
  | 'maxCohortsPerProgram'
  | 'reservedProposalCapacity'
  | 'paused'
  | 'pauseReason'
  | 'pauseExpiresAt'
  | 'createdBy'
> & { _id?: unknown; createdAt?: Date };

type AllocationRecord = Pick<
  CapacityAllocation,
  | 'mentorId'
  | 'scopeKey'
  | 'policyVersion'
  | 'activeEngagements'
  | 'reservedProposals'
  | 'weeklyHours'
  | 'programs'
  | 'cohortsByProgram'
  | 'version'
> & { _id?: unknown };

type ReservationRecord = Pick<
  CapacityReservation,
  | 'mentorId'
  | 'proposalId'
  | 'scopeKey'
  | 'policyVersion'
  | 'idempotencyKey'
  | 'fingerprint'
  | 'weeklyHours'
  | 'status'
  | 'expiresAt'
  | 'releasedAt'
  | 'createdBy'
> & { _id?: unknown };

/**
 * Mentor capacity allocation (MENTOR-041).
 *
 * Policies are immutable, versioned and content-hashed; publishing identical
 * limits is a no-op. Reservations are held by atomic, version-guarded updates
 * on the allocation document, so concurrent requests cannot both take a slot
 * and retries cannot double-count. Reservations expire on a deadline and are
 * released by an idempotent sweeper. Inspectors are read-only — no caller,
 * admin included, silently bypasses the limits.
 */
@Injectable()
export class CapacityService {
  constructor(
    @InjectModel(CapacityPolicy.name)
    private readonly policyModel: Model<CapacityPolicyDocument>,
    @InjectModel(CapacityAllocation.name)
    private readonly allocationModel: Model<CapacityAllocationDocument>,
    @InjectModel(CapacityReservation.name)
    private readonly reservationModel: Model<CapacityReservationDocument>,
    private readonly access: CapacityAccessPolicy,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  // ── Policy management (staff only) ─────────────────────────────────────────

  async definePolicy(ctx: MentorshipRequestContext, dto: DefineCapacityPolicyDto) {
    this.access.assertCanManagePolicy(ctx.user);

    const targetId = dto.scope === CapacityScope.GLOBAL ? null : dto.targetId ?? null;
    const scopeKey = scopeKeyFor(dto.scope, targetId ?? undefined);
    const limits = {
      maxConcurrentEngagements: dto.maxConcurrentEngagements,
      maxWeeklyHours: dto.maxWeeklyHours,
      maxPrograms: dto.maxPrograms,
      maxCohortsPerProgram: dto.maxCohortsPerProgram,
      reservedProposalCapacity: dto.reservedProposalCapacity,
    };
    // Include pause state so a pause/unpause is a new version, not a silent edit.
    const contentHash = this.hash({
      ...limits,
      paused: dto.paused ?? false,
      pauseReason: dto.pauseReason ?? null,
      pauseExpiresAt: dto.pauseExpiresAt ?? null,
    });

    const current = await this.policyModel
      .findOne({ scopeKey })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (current?.contentHash === contentHash) {
      // Identical limits: idempotent publish, no new version.
      return this.policyView(current as PolicyRecord);
    }
    if ((current?.version ?? 0) !== dto.expectedVersion) {
      throw staleVersion('Capacity policy changed since you loaded it; reload and re-apply', {
        scopeKey,
        currentVersion: current?.version ?? 0,
      });
    }

    const version = (current?.version ?? 0) + 1;
    let created: CapacityPolicyDocument;
    try {
      created = await this.policyModel.create({
        scopeKey,
        scope: dto.scope,
        targetId,
        version,
        contentHash,
        ...limits,
        paused: dto.paused ?? false,
        pauseReason: dto.pauseReason ?? null,
        pauseExpiresAt: dto.pauseExpiresAt ? new Date(dto.pauseExpiresAt) : null,
        createdBy: ctx.user.id,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw staleVersion('Another policy version was published concurrently; reload and re-apply', {
          scopeKey,
          currentVersion: version,
        });
      }
      throw err;
    }

    this.safeCount('mentorship_capacity_policy_published_total', { scope: dto.scope });
    this.telemetry.event('mentorship.capacity.policy_published', {
      scopeKey,
      version,
      by: ctx.user.id,
    });
    return this.policyView(created as PolicyRecord);
  }

  /** Read-only calculation for authorized inspectors; never writes or overrides limits. */
  async inspectAllocation(
    ctx: MentorshipRequestContext,
    mentorId: string,
    query: InspectAllocationQueryDto,
  ) {
    this.access.assertCanInspect(ctx.user);
    const policy = await this.resolvePolicy(mentorId, query.programId);
    const stored = await this.allocationModel
      .findOne({ mentorId, scopeKey: policy.scopeKey })
      .lean()
      .exec();
    const allocation = (stored as AllocationRecord | null) ?? this.emptyAllocation(
      mentorId,
      policy.scopeKey,
      policy.version,
    );
    const evaluation = this.evaluate(policy, allocation, {
      programId: query.programId,
      weeklyHours: 0,
    });

    this.safeCount('mentorship_capacity_inspection_total', { outcome: evaluation.allowed ? 'available' : 'blocked' });
    return {
      mentorId,
      inspectedBy: ctx.user.id,
      inspectedAt: new Date(),
      policy: this.policyView(policy),
      usage: {
        activeEngagements: allocation.activeEngagements,
        reservedProposals: allocation.reservedProposals,
        weeklyHours: allocation.weeklyHours,
        programs: allocation.programs,
        cohortsByProgram: allocation.cohortsByProgram,
        version: allocation.version,
      },
      calculation: {
        canAcceptOneMore: evaluation.allowed,
        blockedBy: evaluation.reasons,
        remaining: evaluation.remaining,
      },
    };
  }

  // ── Reservations ────────────────────────────────────────────────────────────

  async reserveCapacity(ctx: MentorshipRequestContext, dto: ReserveCapacityDto) {
    this.access.assertCanActForMentor(ctx.user, dto.mentorId);

    const fingerprint = this.hash({
      mentorId: dto.mentorId,
      proposalId: dto.proposalId,
      programId: dto.programId ?? null,
      cohortId: dto.cohortId ?? null,
      weeklyHours: dto.weeklyHours,
      expiresAt: dto.expiresAt,
    });

    const existing = await this.reservationModel
      .findOne({ mentorId: dto.mentorId, proposalId: dto.proposalId })
      .lean()
      .exec();
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict(
          'MENTOR_CAPACITY_RESERVATION_CONFLICT: reservation key reused with different content',
          ErrorCode.BIZ_RESERVATION_INVALID_STATE,
          { proposalId: dto.proposalId },
        );
      }
      if (existing.status !== ReservationStatus.ACTIVE) {
        throw conflict(
          'MENTOR_CAPACITY_RESERVATION_NOT_ACTIVE: this proposal already released its slot',
          ErrorCode.BIZ_RESERVATION_INVALID_STATE,
          { proposalId: dto.proposalId, status: existing.status },
        );
      }
      // Same proposal + same content: idempotent retry, no second slot held.
      this.safeCount('mentorship_capacity_reservation_total', { outcome: 'idempotent' });
      return this.reservationView(existing as ReservationRecord);
    }

    const now = new Date();
    const expiresAt = new Date(dto.expiresAt);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() > now.getTime() + MAX_RESERVATION_TTL_MS
    ) {
      throw new ValidationDomainException(
        'VAL_RESERVATION_INVALID_EXPIRY: expiry must be in the future and within the allowed window',
        ErrorCode.VAL_RESERVATION_INVALID_EXPIRY,
      );
    }

    const policy = await this.resolvePolicy(dto.mentorId, dto.programId);
    const stored = await this.allocationModel
      .findOne({ mentorId: dto.mentorId, scopeKey: policy.scopeKey })
      .lean()
      .exec();
    const allocation = (stored as AllocationRecord | null) ?? this.emptyAllocation(
      dto.mentorId,
      policy.scopeKey,
      policy.version,
    );
    const evaluation = this.evaluate(policy, allocation, {
      programId: dto.programId,
      cohortId: dto.cohortId,
      weeklyHours: dto.weeklyHours,
    });
    if (!evaluation.allowed) {
      this.safeCount('mentorship_capacity_reservation_total', {
        outcome: 'rejected',
        reason: evaluation.reasons[0],
      });
      throw conflict(
        `MENTOR_CAPACITY_EXHAUSTED: ${evaluation.reasons.join(',')}`,
        ErrorCode.BIZ_MENTORSHIP_CAPACITY_EXHAUSTED,
        { reasons: evaluation.reasons, policyVersion: policy.version },
      );
    }

    await this.incrementAllocation(
      allocation,
      policy,
      dto,
      evaluation.nextPrograms,
      evaluation.nextCohorts,
    );

    let reservation: CapacityReservationDocument | null;
    try {
      reservation = await this.reservationModel.findOneAndUpdate(
        { mentorId: dto.mentorId, proposalId: dto.proposalId },
        {
          $setOnInsert: {
            scopeKey: policy.scopeKey,
            policyVersion: policy.version,
            idempotencyKey: dto.idempotencyKey,
            fingerprint,
            weeklyHours: dto.weeklyHours,
            status: ReservationStatus.ACTIVE,
            expiresAt,
            releasedAt: null,
            createdBy: ctx.user.id,
          },
        },
        { upsert: true, new: true },
      ).exec();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      // A concurrent request created the row first: undo our increment and
      // report the winning reservation, never holding two slots.
      await this.releaseSlot(dto.mentorId, policy.scopeKey, dto.weeklyHours);
      const winner = await this.reservationModel
        .findOne({ mentorId: dto.mentorId, proposalId: dto.proposalId })
        .lean()
        .exec();
      if (winner && winner.fingerprint === fingerprint && winner.status === ReservationStatus.ACTIVE) {
        return this.reservationView(winner as ReservationRecord);
      }
      throw conflict(
        'MENTOR_CAPACITY_RESERVATION_CONFLICT: concurrent reservation differs from this request',
        ErrorCode.BIZ_RESERVATION_INVALID_STATE,
        { proposalId: dto.proposalId },
      );
    }

    if (!reservation) {
      throw new Error('capacity reservation upsert returned no document');
    }
    this.safeCount('mentorship_capacity_reservation_total', { outcome: 'reserved' });
    this.telemetry.event('mentorship.capacity.reserved', {
      mentorId: dto.mentorId,
      proposalId: dto.proposalId,
      policyVersion: policy.version,
    });
    return this.reservationView(reservation as ReservationRecord);
  }

  /** Idempotent release: a repeated call never decrements the allocation twice. */
  async releaseCapacity(
    ctx: MentorshipRequestContext,
    mentorId: string,
    proposalId: string,
  ) {
    this.access.assertCanActForMentor(ctx.user, mentorId);
    const reservation = await this.reservationModel
      .findOne({ mentorId, proposalId })
      .lean()
      .exec();
    if (!reservation) {
      throw new ResourceNotFoundException(
        'MENTOR_CAPACITY_RESERVATION_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    if (reservation.status !== ReservationStatus.ACTIVE) {
      return this.reservationView(reservation as ReservationRecord);
    }

    const released = await this.reservationModel.findOneAndUpdate(
      { _id: reservation._id, status: ReservationStatus.ACTIVE },
      { $set: { status: ReservationStatus.RELEASED, releasedAt: new Date() } },
      { new: true },
    ).exec();
    if (!released) {
      // Another request released it concurrently; report the committed state.
      const fresh = await this.reservationModel.findOne({ mentorId, proposalId }).lean().exec();
      return this.reservationView((fresh ?? reservation) as ReservationRecord);
    }
    await this.releaseSlot(mentorId, reservation.scopeKey, reservation.weeklyHours);
    this.safeCount('mentorship_capacity_reservation_released_total');
    return this.reservationView(released as ReservationRecord);
  }

  /** Integration point for proposal flows: fail fast when a mentor is full or paused. */
  async assertWithinCapacity(
    mentorId: string,
    weeklyHours = 0,
    programId?: string,
    cohortId?: string,
  ): Promise<void> {
    const policy = await this.resolvePolicy(mentorId, programId);
    const stored = await this.allocationModel
      .findOne({ mentorId, scopeKey: policy.scopeKey })
      .lean()
      .exec();
    const allocation = (stored as AllocationRecord | null) ?? this.emptyAllocation(
      mentorId,
      policy.scopeKey,
      policy.version,
    );
    const evaluation = this.evaluate(policy, allocation, { programId, cohortId, weeklyHours });
    if (!evaluation.allowed) {
      throw conflict(
        `MENTOR_CAPACITY_EXHAUSTED: ${evaluation.reasons.join(',')}`,
        ErrorCode.BIZ_MENTORSHIP_CAPACITY_EXHAUSTED,
        { reasons: evaluation.reasons },
      );
    }
  }

  /** Releases expired reservations. Safe to run repeatedly and in parallel. */
  async expireReservations(dto: ExpireReservationsDto, now = new Date()) {
    const limit = dto.limit ?? 500;
    const due = await this.reservationModel
      .find({ status: ReservationStatus.ACTIVE, expiresAt: { $lte: now } })
      .limit(limit)
      .lean()
      .exec();

    let expired = 0;
    for (const row of due) {
      const flipped = await this.reservationModel.findOneAndUpdate(
        { _id: row._id, status: ReservationStatus.ACTIVE, expiresAt: { $lte: now } },
        { $set: { status: ReservationStatus.EXPIRED, releasedAt: now } },
        { new: true },
      ).exec();
      if (!flipped) continue; // another sweeper already handled it
      await this.releaseSlot(row.mentorId, row.scopeKey, row.weeklyHours);
      expired += 1;
      this.safeCount('mentorship_capacity_reservation_expired_total');
    }
    return { scanned: due.length, expired };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async incrementAllocation(
    allocation: AllocationRecord,
    policy: PolicyRecord,
    dto: ReserveCapacityDto,
    programs: string[],
    cohortsByProgram: Record<string, number>,
  ): Promise<void> {
    if (allocation._id !== undefined) {
      const updated = await this.allocationModel.findOneAndUpdate(
        {
          _id: allocation._id,
          version: allocation.version,
          $expr: {
            $and: [
              { $lt: [{ $add: ['$activeEngagements', '$reservedProposals', 1] }, policy.maxConcurrentEngagements] },
              { $lt: [{ $add: ['$reservedProposals', 1] }, policy.reservedProposalCapacity] },
              { $lte: [{ $add: ['$weeklyHours', dto.weeklyHours] }, policy.maxWeeklyHours] },
            ],
          },
        },
        {
          $inc: { reservedProposals: 1, weeklyHours: dto.weeklyHours, version: 1 },
          $set: { policyVersion: policy.version, programs, cohortsByProgram },
        },
        { new: true },
      ).exec();
      if (!updated) {
        throw staleVersion('Capacity allocation changed concurrently; retry the reservation', {
          mentorId: dto.mentorId,
          version: allocation.version,
        });
      }
      return;
    }

    try {
      await this.allocationModel.create({
        mentorId: dto.mentorId,
        scopeKey: policy.scopeKey,
        policyVersion: policy.version,
        activeEngagements: 0,
        reservedProposals: 1,
        weeklyHours: dto.weeklyHours,
        programs,
        cohortsByProgram,
        version: 1,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw staleVersion('Capacity allocation was created concurrently; retry the reservation', {
          mentorId: dto.mentorId,
        });
      }
      throw err;
    }
  }

  private async releaseSlot(mentorId: string, scopeKey: string, weeklyHours: number): Promise<void> {
    await this.allocationModel.updateOne(
      { mentorId, scopeKey, reservedProposals: { $gt: 0 } },
      { $inc: { reservedProposals: -1, weeklyHours: -weeklyHours, version: 1 } },
    ).exec();
  }

  private async resolvePolicy(mentorId: string, programId?: string): Promise<PolicyRecord> {
    const keys = [
      scopeKeyFor(CapacityScope.MENTOR, mentorId),
      ...(programId ? [scopeKeyFor(CapacityScope.PROGRAM, programId)] : []),
      scopeKeyFor(CapacityScope.GLOBAL),
    ];
    for (const scopeKey of keys) {
      const policy = await this.policyModel
        .findOne({ scopeKey })
        .sort({ version: -1 })
        .lean()
        .exec();
      if (policy) return policy as PolicyRecord;
    }
    throw new ResourceNotFoundException(
      'MENTOR_POLICY_MISSING: no effective capacity policy',
      ErrorCode.MENTOR_POLICY_MISSING,
    );
  }

  private evaluate(
    policy: PolicyRecord,
    allocation: AllocationRecord,
    request: { programId?: string; cohortId?: string; weeklyHours: number },
  ) {
    const now = new Date();
    const reasons: string[] = [];
    if (this.isPaused(policy, now)) reasons.push('MENTOR_CAPACITY_PAUSED');
    if (allocation.activeEngagements + allocation.reservedProposals + 1 > policy.maxConcurrentEngagements) {
      reasons.push('MENTOR_CAPACITY_CONCURRENT_LIMIT');
    }
    if (allocation.reservedProposals + 1 > policy.reservedProposalCapacity) {
      reasons.push('MENTOR_CAPACITY_RESERVED_LIMIT');
    }
    if (allocation.weeklyHours + request.weeklyHours > policy.maxWeeklyHours) {
      reasons.push('MENTOR_CAPACITY_WEEKLY_HOURS_LIMIT');
    }

    const programs = [...allocation.programs];
    const cohortsByProgram: Record<string, number> = { ...allocation.cohortsByProgram };
    if (request.programId) {
      if (!programs.includes(request.programId)) {
        if (programs.length + 1 > policy.maxPrograms) reasons.push('MENTOR_CAPACITY_PROGRAM_LIMIT');
        else programs.push(request.programId);
      }
      if (request.cohortId) {
        const count = cohortsByProgram[request.programId] ?? 0;
        if (count + 1 > policy.maxCohortsPerProgram) reasons.push('MENTOR_CAPACITY_COHORT_LIMIT');
        else cohortsByProgram[request.programId] = count + 1;
      }
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      nextPrograms: programs,
      nextCohorts: cohortsByProgram,
      remaining: {
        concurrentSlots: Math.max(
          0,
          policy.maxConcurrentEngagements - allocation.activeEngagements - allocation.reservedProposals - 1,
        ),
        reservedSlots: Math.max(0, policy.reservedProposalCapacity - allocation.reservedProposals - 1),
        weeklyHours: Math.max(0, policy.maxWeeklyHours - allocation.weeklyHours - request.weeklyHours),
        programs: Math.max(0, policy.maxPrograms - programs.length),
      },
    };
  }

  private isPaused(policy: PolicyRecord, now: Date): boolean {
    return (
      policy.paused &&
      (policy.pauseExpiresAt === null || policy.pauseExpiresAt.getTime() > now.getTime())
    );
  }

  private emptyAllocation(mentorId: string, scopeKey: string, policyVersion: number): AllocationRecord {
    return {
      mentorId,
      scopeKey,
      policyVersion,
      activeEngagements: 0,
      reservedProposals: 0,
      weeklyHours: 0,
      programs: [],
      cohortsByProgram: {},
      version: 0,
    };
  }

  private hash(input: unknown): string {
    return createHash('sha256').update(stableStringify(input)).digest('hex');
  }

  private policyView(policy: PolicyRecord) {
    return {
      scopeKey: policy.scopeKey,
      scope: policy.scope,
      targetId: policy.targetId,
      version: policy.version,
      contentHash: policy.contentHash,
      limits: {
        maxConcurrentEngagements: policy.maxConcurrentEngagements,
        maxWeeklyHours: policy.maxWeeklyHours,
        maxPrograms: policy.maxPrograms,
        maxCohortsPerProgram: policy.maxCohortsPerProgram,
        reservedProposalCapacity: policy.reservedProposalCapacity,
      },
      pause: {
        active: this.isPaused(policy, new Date()),
        reason: policy.pauseReason,
        expiresAt: policy.pauseExpiresAt,
      },
      publishedAt: policy.createdAt ?? null,
    };
  }

  private reservationView(reservation: ReservationRecord) {
    return {
      id: String(reservation._id ?? ''),
      mentorId: reservation.mentorId,
      proposalId: reservation.proposalId,
      scopeKey: reservation.scopeKey,
      policyVersion: reservation.policyVersion,
      status: reservation.status,
      weeklyHours: reservation.weeklyHours,
      expiresAt: reservation.expiresAt,
      releasedAt: reservation.releasedAt,
    };
  }

  private safeCount(name: string, labels: Record<string, string> = {}): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Telemetry is best effort and must never break a capacity decision.
    }
  }
}
