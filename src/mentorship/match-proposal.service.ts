import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model, Types } from 'mongoose';
import { AuditAction, AuditOutcome } from '../common/audit/audit-action.enum';
import type { AuditContext } from '../common/audit/audit-context';
import { AuditService, canonicalize } from '../common/audit/audit.service';
import type { AppConfig } from '../config/app.config';
import { DomainEvents } from '../events/event-names';
import type {
  MentorshipEngagementActivatedPayload,
  MentorshipProposalClosedPayload,
  MentorshipProposalEventPayload,
} from '../events/payloads/mentorship.payload';
import type { CoordinatorAdjustProposalDto } from './dto/coordinator-proposal.dto';
import type { CreateMatchProposalDto } from './dto/create-match-proposal.dto';
import type { MatchTermsDto } from './dto/match-terms.dto';
import type {
  ApproveProposalDto,
  RejectProposalDto,
} from './dto/proposal-decision.dto';
import type { QueryProposalsDto } from './dto/query-proposals.dto';
import { MentorshipCapacityService } from './mentorship-capacity.service';
import { MentorshipEligibilityService } from './mentorship-eligibility.service';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import {
  EngagementStatus,
  HardCheck,
  InitiatorKind,
  pairKey,
  ParticipantRole,
  ProposalStatus,
  SoftCheck,
} from './mentorship.constants';
import { isDuplicateKeyError, MentorshipErrors } from './mentorship.errors';
import {
  EngagementRecord,
  MentorshipActor,
  participantRoleOf,
  ProposalRecord,
  redactChecksForParticipant,
  toEngagementView,
  toProposalView,
} from './mentorship.policy';
import {
  MatchProposal,
  MatchProposalDocument,
  ProposalHistoryEntry,
} from './schemas/match-proposal.schema';
import type { MatchTerms } from './schemas/match-terms.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementDocument,
} from './schemas/mentorship-engagement.schema';

const AUDIT_TARGET = 'mentorship_proposal';
const HOUR_MS = 60 * 60 * 1000;

export interface CreateProposalInput extends CreateMatchProposalDto {
  initiatorKind: InitiatorKind;
  coordinator?: { reason: string; internalNote?: string };
  overrides?: { check: SoftCheck; reason: string }[];
  supersedesProposalId?: string;
}

/** Who performed a lifecycle action; `system` for background jobs. */
export interface ActionContext {
  actorId: string;
  actorRole: string | null;
  audit: AuditContext;
}

const fromActor = (actor: MentorshipActor): ActionContext => ({
  actorId: actor.userId,
  actorRole: actor.platformRole,
  audit: actor.audit,
});

/**
 * Match proposal lifecycle: creation (MENTOR-037), mutual acceptance and
 * engagement activation (MENTOR-038), and the coordinator-assisted paths
 * (MENTOR-039).
 *
 * Every state transition is a single conditional update on the expected
 * current state, so retries and concurrent requests either observe the
 * transition already made (and return it) or fail with a stable error.
 */
@Injectable()
export class MatchProposalService {
  constructor(
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposalDocument>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagementDocument>,
    private readonly eligibility: MentorshipEligibilityService,
    private readonly capacity: MentorshipCapacityService,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
    private readonly telemetry: MentorshipTelemetry,
    private readonly config: ConfigService,
  ) {}

  // ── Creation ──────────────────────────────────────────────────────────────

  /** A mentee or mentor proposes a match that includes themself. */
  async createAsParticipant(dto: CreateMatchProposalDto, actor: MentorshipActor) {
    let initiatorKind: InitiatorKind;
    if (dto.mentorId === actor.userId) {
      initiatorKind = InitiatorKind.MENTOR;
    } else if (dto.menteeId === actor.userId) {
      initiatorKind = InitiatorKind.MENTEE;
    } else {
      throw this.telemetry.fail(
        MentorshipErrors.initiatorMismatch(
          actor.platformRole === 'tutor' ? 'mentorId' : 'menteeId',
        ),
      );
    }
    return this.create({ ...dto, initiatorKind }, actor);
  }

  async create(input: CreateProposalInput, actor: MentorshipActor) {
    const asCoordinator = input.initiatorKind === InitiatorKind.COORDINATOR;
    const result = await this.eligibility.evaluate(input);

    if (result.hardFailures.length > 0) {
      if (asCoordinator) {
        // Attempted bypasses of hard checks are themselves reportable.
        await this.auditService.record({
          action: AuditAction.MENTORSHIP_PROPOSAL_CREATED,
          context: actor.audit,
          target: { type: AUDIT_TARGET, id: null },
          outcome: AuditOutcome.DENIED,
          after: { ...this.candidateOf(input), failedChecks: result.hardFailures },
          reason: input.coordinator?.reason ?? null,
        });
        throw this.telemetry.fail(MentorshipErrors.ineligible(result.hardFailures));
      }
      throw this.telemetry.fail(
        this.participantEligibilityError(
          result.hardFailures,
          input.initiatorKind === InitiatorKind.MENTOR
            ? ParticipantRole.MENTOR
            : ParticipantRole.MENTEE,
        ),
      );
    }

    const overrides = input.overrides ?? [];
    const unnecessary = overrides
      .map((o) => o.check)
      .filter((check) => !result.softFailures.includes(check));
    if (unnecessary.length > 0) {
      throw this.telemetry.fail(MentorshipErrors.overrideUnnecessary(unnecessary));
    }
    const overridden = new Set(overrides.map((o) => o.check));
    const missing = result.softFailures.filter((c) => !overridden.has(c));
    if (missing.length > 0) {
      throw this.telemetry.fail(
        MentorshipErrors.overrideRequired(missing, asCoordinator),
      );
    }

    const ctx = fromActor(actor);
    let superseded: ProposalRecord | null = null;
    if (input.supersedesProposalId) {
      superseded = await this.closeOrThrow(
        input.supersedesProposalId,
        ProposalStatus.SUPERSEDED,
        ctx,
        input.coordinator?.reason ?? 'superseded',
      );
    }

    const now = new Date();
    const terms = normaliseTerms(input.terms);
    const termsHash = hashTerms(terms);
    const key = pairKey(input.mentorId, input.menteeId, input.programId);

    let created: ProposalRecord;
    try {
      const doc = await this.proposalModel.create({
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        programId: input.programId,
        compatibilityReasons: result.compatibilityReasons,
        terms,
        termsVersion: 1,
        termsHash,
        expiresAt: new Date(now.getTime() + this.ttlHours(input.expiresInHours) * HOUR_MS),
        initiator: {
          userId: actor.userId,
          platformRole: actor.platformRole,
          kind: input.initiatorKind,
        },
        initiatorNote: input.note ?? null,
        status: ProposalStatus.PENDING,
        requiredApprovals: this.requiredApprovals(),
        coordinator: input.coordinator
          ? {
              coordinatorId: actor.userId,
              reason: input.coordinator.reason,
              internalNote: input.coordinator.internalNote ?? null,
            }
          : null,
        overrides: overrides.map((o) => ({
          check: o.check,
          reason: o.reason,
          coordinatorId: actor.userId,
          appliedAt: now,
        })),
        supersedesProposalId: superseded ? superseded._id.toString() : null,
        history: [
          this.historyEntry('created', ctx, input.coordinator?.reason ?? null, 1, now),
        ],
        openKey: key,
      });
      created = doc.toObject() as ProposalRecord;
    } catch (err) {
      if (superseded) await this.reopenSuperseded(superseded);
      if (isDuplicateKeyError(err, 'openKey')) {
        const existing = await this.proposalModel
          .findOne({ openKey: key }, { _id: 1 })
          .lean();
        throw this.telemetry.fail(
          MentorshipErrors.duplicateProposal(existing?._id.toString()),
        );
      }
      throw err;
    }

    if (superseded) {
      await this.proposalModel.updateOne(
        { _id: superseded._id },
        { $set: { supersededByProposalId: created._id.toString() } },
      );
      await this.recordClosed(superseded, AuditAction.MENTORSHIP_PROPOSAL_SUPERSEDED, ctx);
    }

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_PROPOSAL_CREATED,
      context: actor.audit,
      target: { type: AUDIT_TARGET, id: created._id.toString() },
      after: toProposalView(created, { coordinator: true }),
      reason: input.coordinator?.reason ?? null,
    });
    for (const o of created.overrides) {
      await this.auditService.record({
        action: AuditAction.MENTORSHIP_OVERRIDE_APPLIED,
        context: actor.audit,
        target: { type: AUDIT_TARGET, id: created._id.toString() },
        after: { check: o.check },
        reason: o.reason,
      });
      this.telemetry.overrideApplied(o.check, {
        proposalId: created._id.toString(),
        coordinatorId: actor.userId,
      });
    }
    this.telemetry.proposalEvent(
      'created',
      { initiator: input.initiatorKind },
      { proposalId: created._id.toString() },
    );
    this.events.emit(
      DomainEvents.MENTORSHIP_PROPOSAL_CREATED,
      this.eventPayload(created),
    );

    return toProposalView(created, { coordinator: asCoordinator });
  }

  // ── Acceptance ────────────────────────────────────────────────────────────

  /**
   * Records the caller's approval of the current terms. Once every required
   * participant has approved the same terms version, the engagement is
   * activated. Repeating an approval is a no-op that resumes activation.
   */
  async approve(id: string, dto: ApproveProposalDto, actor: MentorshipActor) {
    let proposal = await this.loadForParticipant(id, actor);
    const side = participantRoleOf(proposal, actor.userId)!;
    if (!proposal.requiredApprovals.includes(side)) {
      throw this.telemetry.fail(MentorshipErrors.notParticipant());
    }

    if (hasCurrentApproval(proposal, side)) {
      if (proposal.status === ProposalStatus.PENDING) {
        proposal = await this.tryActivate(proposal, fromActor(actor));
      }
      if (
        proposal.status === ProposalStatus.PENDING ||
        proposal.status === ProposalStatus.ACTIVATING ||
        proposal.status === ProposalStatus.ACCEPTED
      ) {
        return toProposalView(proposal, { coordinator: false });
      }
    }

    this.assertApprovable(proposal, dto);

    // Blocks or eligibility changes since creation still stop the match.
    // Capacity is excluded: the atomic reservation below is authoritative.
    const recheck = await this.eligibility.evaluate(proposal);
    const failures = recheck.hardFailures.filter(
      (c) => c !== HardCheck.MENTOR_AT_CAPACITY,
    );
    if (failures.length > 0) {
      throw this.telemetry.fail(this.participantEligibilityError(failures, side));
    }

    if (!(await this.capacity.reserve(proposal))) {
      throw this.telemetry.fail(MentorshipErrors.capacityExhausted());
    }

    const now = new Date();
    const ctx = fromActor(actor);
    const updated = await this.proposalModel
      .findOneAndUpdate(
        {
          _id: proposal._id,
          status: ProposalStatus.PENDING,
          termsVersion: proposal.termsVersion,
          termsHash: proposal.termsHash,
          expiresAt: { $gt: now },
          approvals: {
            $not: {
              $elemMatch: {
                participantRole: side,
                termsVersion: proposal.termsVersion,
              },
            },
          },
        },
        {
          $push: {
            approvals: {
              participantRole: side,
              userId: actor.userId,
              termsVersion: proposal.termsVersion,
              termsHash: proposal.termsHash,
              approvedAt: now,
            },
            history: this.historyEntry(
              `approved_by_${side}`,
              ctx,
              null,
              proposal.termsVersion,
              now,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ProposalRecord>();

    if (!updated) {
      // Lost a race: re-evaluate against the fresh state.
      const fresh = await this.load(id);
      if (hasCurrentApproval(fresh, side)) {
        return toProposalView(await this.tryActivate(fresh, ctx), {
          coordinator: false,
        });
      }
      // Don't leave the hold we just took on a proposal nobody has approved.
      if (!fresh.requiredApprovals.some((r) => hasCurrentApproval(fresh, r))) {
        await this.capacity.release(fresh);
      }
      this.assertApprovable(fresh, dto);
      throw this.telemetry.fail(MentorshipErrors.notPending(fresh.status));
    }

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_PROPOSAL_APPROVED,
      context: actor.audit,
      target: { type: AUDIT_TARGET, id: id },
      after: { participantRole: side, termsVersion: updated.termsVersion },
    });
    this.telemetry.proposalEvent('approved', { side }, { proposalId: id });

    return toProposalView(await this.tryActivate(updated, ctx), {
      coordinator: false,
    });
  }

  async reject(id: string, dto: RejectProposalDto, actor: MentorshipActor) {
    const proposal = await this.loadForParticipant(id, actor);
    if (
      proposal.status === ProposalStatus.REJECTED &&
      proposal.closedBy === actor.userId
    ) {
      return toProposalView(proposal, { coordinator: false });
    }
    const ctx = fromActor(actor);
    const closed = await this.closeOrThrow(
      id,
      ProposalStatus.REJECTED,
      ctx,
      dto.reason ?? null,
    );
    await this.recordClosed(closed, AuditAction.MENTORSHIP_PROPOSAL_REJECTED, ctx);
    return toProposalView(closed, { coordinator: false });
  }

  /** The participant who initiated a proposal may withdraw it while open. */
  async withdrawAsParticipant(id: string, actor: MentorshipActor) {
    const proposal = await this.loadForParticipant(id, actor);
    if (proposal.initiator.userId !== actor.userId) {
      throw this.telemetry.fail(MentorshipErrors.notParticipant());
    }
    return toProposalView(await this.withdraw(proposal, actor, null), {
      coordinator: false,
    });
  }

  async withdrawAsCoordinator(id: string, reason: string, actor: MentorshipActor) {
    const proposal = await this.load(id);
    return toProposalView(await this.withdraw(proposal, actor, reason), {
      coordinator: true,
    });
  }

  private async withdraw(
    proposal: ProposalRecord,
    actor: MentorshipActor,
    reason: string | null,
  ): Promise<ProposalRecord> {
    if (
      proposal.status === ProposalStatus.WITHDRAWN &&
      proposal.closedBy === actor.userId
    ) {
      return proposal;
    }
    const ctx = fromActor(actor);
    const closed = await this.closeOrThrow(
      proposal._id.toString(),
      ProposalStatus.WITHDRAWN,
      ctx,
      reason,
    );
    await this.recordClosed(closed, AuditAction.MENTORSHIP_PROPOSAL_WITHDRAWN, ctx);
    return closed;
  }

  // ── Coordinator adjustment (MENTOR-039) ───────────────────────────────────

  /**
   * Changes terms and/or expiry of a pending proposal. A terms change bumps
   * `termsVersion`, clears every approval and releases any capacity hold, so
   * no engagement can activate without fresh participant consent.
   */
  async adjust(id: string, dto: CoordinatorAdjustProposalDto, actor: MentorshipActor) {
    const proposal = await this.load(id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw this.telemetry.fail(MentorshipErrors.notPending(proposal.status));
    }

    const now = new Date();
    const terms = dto.terms ? normaliseTerms(dto.terms) : proposal.terms;
    const termsHash = hashTerms(terms);
    const termsChanged = termsHash !== proposal.termsHash;
    if (!termsChanged && dto.expiresInHours === undefined) {
      return toProposalView(proposal, { coordinator: true });
    }

    const ctx = fromActor(actor);
    const nextVersion = proposal.termsVersion + (termsChanged ? 1 : 0);
    const set: Record<string, unknown> = {
      coordinator: {
        coordinatorId: actor.userId,
        reason: dto.reason,
        internalNote: dto.internalNote ?? proposal.coordinator?.internalNote ?? null,
      },
    };
    if (dto.expiresInHours !== undefined) {
      set.expiresAt = new Date(now.getTime() + this.ttlHours(dto.expiresInHours) * HOUR_MS);
    }
    if (termsChanged) {
      Object.assign(set, {
        terms,
        termsHash,
        termsVersion: nextVersion,
        approvals: [],
      });
    }

    const updated = await this.proposalModel
      .findOneAndUpdate(
        {
          _id: proposal._id,
          status: ProposalStatus.PENDING,
          termsVersion: proposal.termsVersion,
        },
        {
          $set: set,
          $push: {
            history: this.historyEntry(
              termsChanged ? 'terms_adjusted' : 'expiry_adjusted',
              ctx,
              dto.reason,
              nextVersion,
              now,
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ProposalRecord>();

    if (!updated) {
      const fresh = await this.load(id);
      throw this.telemetry.fail(
        fresh.status === ProposalStatus.PENDING
          ? MentorshipErrors.termsStale(fresh.termsVersion, fresh.termsHash)
          : MentorshipErrors.notPending(fresh.status),
      );
    }

    if (termsChanged) await this.capacity.release(updated);

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_PROPOSAL_ADJUSTED,
      context: actor.audit,
      target: { type: AUDIT_TARGET, id },
      before: {
        terms: proposal.terms,
        termsVersion: proposal.termsVersion,
        expiresAt: proposal.expiresAt,
      },
      after: {
        terms: updated.terms,
        termsVersion: updated.termsVersion,
        expiresAt: updated.expiresAt,
      },
      reason: dto.reason,
    });
    this.telemetry.proposalEvent(
      'adjusted',
      { termsChanged: String(termsChanged) },
      { proposalId: id, coordinatorId: actor.userId },
    );
    this.events.emit(
      DomainEvents.MENTORSHIP_PROPOSAL_ADJUSTED,
      this.eventPayload(updated),
    );

    return toProposalView(
      (await this.proposalModel.findById(updated._id).lean<ProposalRecord>()) ?? updated,
      { coordinator: true },
    );
  }

  // ── Activation ────────────────────────────────────────────────────────────

  private async tryActivate(
    proposal: ProposalRecord,
    ctx: ActionContext,
  ): Promise<ProposalRecord> {
    const ready = proposal.requiredApprovals.every((role) =>
      hasCurrentApproval(proposal, role),
    );
    if (!ready || proposal.status !== ProposalStatus.PENDING) return proposal;

    const claimed = await this.proposalModel
      .findOneAndUpdate(
        {
          _id: proposal._id,
          status: ProposalStatus.PENDING,
          termsVersion: proposal.termsVersion,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: ProposalStatus.ACTIVATING,
            activationStartedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ProposalRecord>();

    // Another request won the claim (or the proposal changed); report state.
    if (!claimed) return this.load(proposal._id.toString());

    return this.completeActivation(claimed, ctx);
  }

  /**
   * Turns an `activating` proposal into an engagement. Also used by the
   * sweeper to recover activations interrupted by a crash; the unique
   * `proposalId` index guarantees at most one engagement either way.
   */
  async completeActivation(
    proposal: ProposalRecord,
    ctx: ActionContext,
  ): Promise<ProposalRecord> {
    const id = proposal._id.toString();

    if (!(await this.capacity.reserve(proposal))) {
      await this.revertActivation(proposal);
      this.telemetry.activation('capacity_exhausted', { proposalId: id });
      throw this.telemetry.fail(MentorshipErrors.capacityExhausted());
    }

    let engagement: EngagementRecord | null = null;
    try {
      const doc = await this.engagementModel.create({
        proposalId: id,
        mentorId: proposal.mentorId,
        menteeId: proposal.menteeId,
        programId: proposal.programId,
        terms: proposal.terms,
        termsVersion: proposal.termsVersion,
        termsHash: proposal.termsHash,
        status: EngagementStatus.ACTIVE,
        coordinatorAssisted: proposal.coordinator !== null,
        activatedAt: new Date(),
        activeKey: pairKey(proposal.mentorId, proposal.menteeId, proposal.programId),
      });
      engagement = doc.toObject() as EngagementRecord;
    } catch (err) {
      if (isDuplicateKeyError(err, 'proposalId')) {
        engagement = await this.engagementModel
          .findOne({ proposalId: id })
          .lean<EngagementRecord>();
        this.telemetry.activation('duplicate_suppressed', { proposalId: id });
      } else if (isDuplicateKeyError(err, 'activeKey')) {
        const closed = await this.close(
          id,
          ProposalStatus.WITHDRAWN,
          ctx,
          HardCheck.ALREADY_ENGAGED,
          [ProposalStatus.ACTIVATING],
        );
        if (closed) {
          await this.recordClosed(closed, AuditAction.MENTORSHIP_PROPOSAL_WITHDRAWN, ctx);
        }
        this.telemetry.activation('already_engaged', { proposalId: id });
        throw this.telemetry.fail(MentorshipErrors.alreadyEngaged());
      } else {
        await this.revertActivation(proposal);
        this.telemetry.activation('error', { proposalId: id });
        throw err;
      }
    }

    const engagementId = engagement!._id.toString();
    const accepted = await this.proposalModel
      .findOneAndUpdate(
        { _id: proposal._id, status: ProposalStatus.ACTIVATING },
        {
          $set: {
            status: ProposalStatus.ACCEPTED,
            engagementId,
            activationStartedAt: null,
          },
          $unset: { openKey: 1 },
          $push: {
            history: this.historyEntry(
              'engagement_activated',
              ctx,
              null,
              proposal.termsVersion,
              new Date(),
            ),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ProposalRecord>();

    if (accepted) {
      await this.auditService.record({
        action: AuditAction.MENTORSHIP_ENGAGEMENT_ACTIVATED,
        context: ctx.audit,
        target: { type: 'mentorship_engagement', id: engagementId },
        after: toEngagementView(engagement!),
      });
      this.telemetry.activation('activated', { proposalId: id, engagementId });
      const payload: MentorshipEngagementActivatedPayload = {
        engagementId,
        proposalId: id,
        mentorId: proposal.mentorId,
        menteeId: proposal.menteeId,
        programId: proposal.programId,
        termsHash: proposal.termsHash,
        coordinatorAssisted: proposal.coordinator !== null,
        occurredAt: new Date(),
      };
      this.events.emit(DomainEvents.MENTORSHIP_ENGAGEMENT_ACTIVATED, payload);
      return accepted;
    }
    return this.load(id);
  }

  private async revertActivation(proposal: ProposalRecord): Promise<void> {
    await this.proposalModel.updateOne(
      { _id: proposal._id, status: ProposalStatus.ACTIVATING },
      { $set: { status: ProposalStatus.PENDING, activationStartedAt: null } },
    );
  }

  // ── Closing (shared with sweeper and profile service) ─────────────────────

  /**
   * Conditionally closes an open proposal and releases its capacity hold.
   * Returns null when the proposal was not in an expected status.
   */
  async close(
    id: string,
    status: ProposalStatus,
    ctx: ActionContext,
    reason: string | null,
    expected: ProposalStatus[] = [ProposalStatus.PENDING],
    extraFilter: Record<string, unknown> = {},
  ): Promise<ProposalRecord | null> {
    const now = new Date();
    const closed = await this.proposalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), status: { $in: expected }, ...extraFilter },
        {
          $set: {
            status,
            closedBy: ctx.actorId,
            closedReason: reason,
            closedAt: now,
            activationStartedAt: null,
          },
          $unset: { openKey: 1 },
          $push: { history: this.historyEntry(status, ctx, reason, null, now) },
        },
        { returnDocument: 'after' },
      )
      .lean<ProposalRecord>();
    if (!closed) return null;
    await this.capacity.release(closed);
    return closed;
  }

  /** Closes every open proposal between two users (used when a block is created). */
  async closeOpenBetween(a: string, b: string, ctx: ActionContext, reason: string) {
    const open = await this.proposalModel
      .find(
        {
          status: ProposalStatus.PENDING,
          $or: [
            { mentorId: a, menteeId: b },
            { mentorId: b, menteeId: a },
          ],
        },
        { _id: 1 },
      )
      .lean();
    return this.closeMany(open.map((p) => p._id.toString()), ctx, reason);
  }

  /** Closes every open proposal on one side for a user (eligibility revoked). */
  async closeOpenFor(
    userId: string,
    side: ParticipantRole,
    ctx: ActionContext,
    reason: string,
  ) {
    const field = side === ParticipantRole.MENTOR ? 'mentorId' : 'menteeId';
    const open = await this.proposalModel
      .find({ status: ProposalStatus.PENDING, [field]: userId }, { _id: 1 })
      .lean();
    return this.closeMany(open.map((p) => p._id.toString()), ctx, reason);
  }

  private async closeMany(ids: string[], ctx: ActionContext, reason: string) {
    let count = 0;
    for (const id of ids) {
      const closed = await this.close(id, ProposalStatus.WITHDRAWN, ctx, reason);
      if (closed) {
        count += 1;
        await this.recordClosed(closed, AuditAction.MENTORSHIP_PROPOSAL_WITHDRAWN, ctx);
      }
    }
    return count;
  }

  async recordClosed(
    proposal: ProposalRecord,
    action: AuditAction,
    ctx: ActionContext,
  ): Promise<void> {
    const id = proposal._id.toString();
    await this.auditService.record({
      action,
      context: ctx.audit,
      target: { type: AUDIT_TARGET, id },
      after: { status: proposal.status },
      reason: proposal.closedReason,
    });
    this.telemetry.proposalEvent(
      proposal.status,
      { initiator: proposal.initiator.kind },
      { proposalId: id, closedBy: ctx.actorId },
    );
    const payload: MentorshipProposalClosedPayload = {
      ...this.eventPayload(proposal),
      status: proposal.status,
      closedBy: ctx.actorId,
    };
    this.events.emit(DomainEvents.MENTORSHIP_PROPOSAL_CLOSED, payload);
  }

  private async closeOrThrow(
    id: string,
    status: ProposalStatus,
    ctx: ActionContext,
    reason: string | null,
  ): Promise<ProposalRecord> {
    const closed = await this.close(id, status, ctx, reason);
    if (closed) return closed;
    const fresh = await this.load(id);
    throw this.telemetry.fail(MentorshipErrors.notPending(fresh.status));
  }

  private async reopenSuperseded(proposal: ProposalRecord): Promise<void> {
    try {
      await this.proposalModel.updateOne(
        {
          _id: proposal._id,
          status: ProposalStatus.SUPERSEDED,
          supersededByProposalId: null,
        },
        {
          $set: {
            status: ProposalStatus.PENDING,
            closedBy: null,
            closedReason: null,
            closedAt: null,
            openKey: pairKey(proposal.mentorId, proposal.menteeId, proposal.programId),
          },
        },
      );
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getForParticipant(id: string, actor: MentorshipActor) {
    return toProposalView(await this.loadForParticipant(id, actor), {
      coordinator: false,
    });
  }

  async getForCoordinator(id: string) {
    return toProposalView(await this.load(id), { coordinator: true });
  }

  async listForParticipant(query: QueryProposalsDto, actor: MentorshipActor) {
    return this.list(
      { $or: [{ mentorId: actor.userId }, { menteeId: actor.userId }] },
      query,
      false,
    );
  }

  async list(
    filter: Record<string, unknown>,
    query: QueryProposalsDto,
    coordinator: boolean,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { ...filter, ...(query.status && { status: query.status }) };
    const [rows, total] = await Promise.all([
      this.proposalModel
        .find(where)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ProposalRecord[]>(),
      this.proposalModel.countDocuments(where),
    ]);
    return {
      data: rows.map((p) => toProposalView(p, { coordinator })),
      meta: { page, limit, total },
    };
  }

  async listEngagements(actor: MentorshipActor) {
    const rows = await this.engagementModel
      .find({ $or: [{ mentorId: actor.userId }, { menteeId: actor.userId }] })
      .sort({ activatedAt: -1 })
      .limit(100)
      .lean<EngagementRecord[]>();
    return rows.map(toEngagementView);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async load(id: string): Promise<ProposalRecord> {
    const proposal = Types.ObjectId.isValid(id)
      ? await this.proposalModel.findById(id).lean<ProposalRecord>()
      : null;
    if (!proposal) throw this.telemetry.fail(MentorshipErrors.proposalNotFound());
    return proposal;
  }

  /** Non-participants get 404 rather than 403 so ids reveal nothing. */
  private async loadForParticipant(
    id: string,
    actor: MentorshipActor,
  ): Promise<ProposalRecord> {
    const proposal = await this.load(id);
    if (!participantRoleOf(proposal, actor.userId)) {
      throw this.telemetry.fail(MentorshipErrors.proposalNotFound());
    }
    return proposal;
  }

  private assertApprovable(proposal: ProposalRecord, dto: ApproveProposalDto) {
    if (proposal.status !== ProposalStatus.PENDING) {
      throw this.telemetry.fail(MentorshipErrors.notPending(proposal.status));
    }
    if (proposal.expiresAt.getTime() <= Date.now()) {
      throw this.telemetry.fail(MentorshipErrors.expired());
    }
    if (
      dto.termsVersion !== proposal.termsVersion ||
      (dto.termsHash !== undefined && dto.termsHash !== proposal.termsHash)
    ) {
      throw this.telemetry.fail(
        MentorshipErrors.termsStale(proposal.termsVersion, proposal.termsHash),
      );
    }
  }

  private participantEligibilityError(failures: HardCheck[], side: ParticipantRole) {
    const visible = redactChecksForParticipant(failures, side);
    return visible.length === 0
      ? MentorshipErrors.blocked()
      : MentorshipErrors.ineligible(visible);
  }

  private candidateOf(input: CreateProposalInput) {
    return {
      mentorId: input.mentorId,
      menteeId: input.menteeId,
      programId: input.programId,
    };
  }

  private historyEntry(
    action: string,
    ctx: ActionContext,
    reason: string | null,
    termsVersion: number | null,
    at: Date,
  ): ProposalHistoryEntry {
    return {
      action,
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      reason,
      termsVersion,
      at,
    };
  }

  private eventPayload(p: ProposalRecord): MentorshipProposalEventPayload {
    return {
      proposalId: p._id.toString(),
      mentorId: p.mentorId,
      menteeId: p.menteeId,
      programId: p.programId,
      termsVersion: p.termsVersion,
      initiatorKind: p.initiator.kind,
      coordinatorId: p.coordinator?.coordinatorId ?? null,
      occurredAt: new Date(),
    };
  }

  private get settings(): AppConfig['mentorship'] {
    return (
      this.config.get<AppConfig['mentorship']>('mentorship') ?? {
        requiredApprovals: [ParticipantRole.MENTOR, ParticipantRole.MENTEE],
        defaultProposalTtlHours: 72,
        maxProposalTtlHours: 720,
        sweepCron: '0 */5 * * * *',
      }
    );
  }

  private ttlHours(requested?: number): number {
    const { defaultProposalTtlHours, maxProposalTtlHours } = this.settings;
    return Math.min(requested ?? defaultProposalTtlHours, maxProposalTtlHours);
  }

  private requiredApprovals(): ParticipantRole[] {
    const valid = Object.values(ParticipantRole) as string[];
    const roles = [...new Set(this.settings.requiredApprovals)].filter((r) =>
      valid.includes(r),
    ) as ParticipantRole[];
    return roles.length > 0
      ? roles
      : [ParticipantRole.MENTOR, ParticipantRole.MENTEE];
  }
}

function hasCurrentApproval(p: ProposalRecord, side: ParticipantRole): boolean {
  return p.approvals.some(
    (a) =>
      a.participantRole === side &&
      a.termsVersion === p.termsVersion &&
      a.termsHash === p.termsHash,
  );
}

function normaliseTerms(dto: MatchTermsDto | MatchTerms): MatchTerms {
  return {
    sessionsPerMonth: dto.sessionsPerMonth,
    sessionLengthMinutes: dto.sessionLengthMinutes,
    durationWeeks: dto.durationWeeks,
    pricePerSession: dto.pricePerSession,
    currency: dto.currency,
    notes: dto.notes ?? null,
  };
}

/** Stable fingerprint participants confirm when approving. */
export function hashTerms(terms: MatchTerms): string {
  return crypto.createHash('sha256').update(canonicalize(terms)).digest('hex');
}

