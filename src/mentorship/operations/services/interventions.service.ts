import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';
import {
  OPEN_PROPOSAL_STATUSES,
  ParticipantRole,
  ProposalStatus,
} from '../../mentorship.constants';
import type { MentorshipActor } from '../../mentorship.policy';
import { CreateInterventionDto } from '../dto/create-intervention.dto';
import {
  AlertSeverity,
  AlertType,
  DisputeStatus,
  InterventionTargetType,
  InterventionType,
} from '../enums/mentorship-operations.enums';
import { MentorshipAlert } from '../schemas/mentorship-alert.schema';
import { MentorshipOpsDispute } from '../schemas/mentorship-ops-dispute.schema';
import { MentorshipIntervention } from '../schemas/mentorship-intervention.schema';
import { MatchProposal } from '../../schemas/match-proposal.schema';
import { MentorshipProfile } from '../../schemas/mentorship-profile.schema';

const DEFAULT_EXTEND_HOURS = 48;

/**
 * Coordinator interventions (MENTOR-116 / issue #1434).
 *
 * Every action is (a) guarded by a per-action permission check beyond the
 * controller's role gate, (b) effect-checked against the current record
 * state, and (c) replay-safe via a deterministic dedupe key so a lost
 * response can never double-apply a non-repeatable effect such as expiring
 * a proposal. Coordinator notes are internal and never shown to
 * participants; participants only receive opaque alert notifications.
 */
@Injectable()
export class InterventionsService {
  private readonly logger = new Logger(InterventionsService.name);

  constructor(
    @InjectModel(MentorshipIntervention.name)
    private readonly interventionModel: Model<MentorshipIntervention>,
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposal>,
    @InjectModel(MentorshipOpsDispute.name)
    private readonly disputeModel: Model<MentorshipOpsDispute>,
    @InjectModel(MentorshipAlert.name)
    private readonly alertModel: Model<MentorshipAlert>,
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfile>,
  ) {}

  /** resolve_dispute is admin-only; every other action allows moderators too. */
  private assertCanAct(actor: MentorshipActor, type: InterventionType): void {
    if (
      type === InterventionType.RESOLVE_DISPUTE &&
      actor.platformRole !== Role.ADMIN
    ) {
      throw new ForbiddenDomainException(
        'Only administrators can resolve disputes; moderators can escalate',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  async perform(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    this.assertCanAct(actor, dto.type);
    switch (dto.type) {
      case InterventionType.CONTACT_PARTICIPANT:
        return this.contactParticipant(actor, dto);
      case InterventionType.EXTEND_PROPOSAL_EXPIRY:
        return this.extendProposalExpiry(actor, dto);
      case InterventionType.EXPIRE_PROPOSAL:
        return this.expireProposal(actor, dto);
      case InterventionType.ESCALATE_DISPUTE:
        return this.escalateDispute(actor, dto);
      case InterventionType.RESOLVE_DISPUTE:
        return this.resolveDispute(actor, dto);
      default:
        throw new BusinessRuleException(
          'Unknown intervention type',
          ErrorCode.VAL_INVALID_INPUT,
        );
    }
  }

  /** Deterministic replay key; same inputs always map to the same effect. */
  private dedupeKeyFor(dto: CreateInterventionDto): string {
    switch (dto.type) {
      case InterventionType.EXTEND_PROPOSAL_EXPIRY:
        return `${dto.type}:${dto.proposalId}:${dto.newExpiresAt ?? `+${dto.extendHours ?? DEFAULT_EXTEND_HOURS}h`}`;
      case InterventionType.EXPIRE_PROPOSAL:
        return `${dto.type}:${dto.proposalId}`;
      case InterventionType.ESCALATE_DISPUTE:
        return `${dto.type}:${dto.disputeId}`;
      case InterventionType.RESOLVE_DISPUTE:
        return `${dto.type}:${dto.disputeId}`;
      case InterventionType.CONTACT_PARTICIPANT: {
        const hourBucket = new Date().toISOString().slice(0, 13);
        return `${dto.type}:${dto.participantId}:${hourBucket}`;
      }
    }
  }

  private targetTypeFor(type: InterventionType): InterventionTargetType {
    switch (type) {
      case InterventionType.CONTACT_PARTICIPANT:
        return InterventionTargetType.PARTICIPANT;
      case InterventionType.ESCALATE_DISPUTE:
      case InterventionType.RESOLVE_DISPUTE:
        return InterventionTargetType.DISPUTE;
      default:
        return InterventionTargetType.PROPOSAL;
    }
  }

  private targetIdFor(dto: CreateInterventionDto): string {
    return dto.proposalId ?? dto.disputeId ?? dto.participantId ?? '';
  }

  /** Returns the replayed record when the effect was already applied. */
  private async findExisting(
    dedupeKey: string,
  ): Promise<Record<string, unknown> | null> {
    const existing = await this.interventionModel.findOne({ dedupeKey }).lean();
    if (!existing) return null;
    return this.present(existing as never, true);
  }

  private present(
    row: {
      _id: unknown;
      type: InterventionType;
      targetType: InterventionTargetType;
      targetId: string;
      programId?: string | null;
      actorId: string;
      actorRole?: string | null;
      reason?: string | null;
      note?: string | null;
      effect?: Record<string, unknown>;
      createdAt?: Date;
    },
    replayed: boolean,
  ): Record<string, unknown> {
    return {
      id: String(row._id),
      type: row.type,
      targetType: row.targetType,
      targetId: row.targetId,
      programId: row.programId ?? null,
      actor: { userId: row.actorId, role: row.actorRole ?? null },
      reason: row.reason ?? null,
      note: row.note ?? null,
      effect: row.effect ?? {},
      createdAt: row.createdAt ?? null,
      replayed,
    };
  }

  private async record(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
    effect: Record<string, unknown>,
    programId: string | null,
  ): Promise<Record<string, unknown>> {
    const dedupeKey = this.dedupeKeyFor(dto);
    try {
      const created = await this.interventionModel.create({
        type: dto.type,
        targetType: this.targetTypeFor(dto.type),
        targetId: this.targetIdFor(dto),
        programId,
        actorId: actor.userId,
        actorRole: actor.platformRole,
        reason: dto.reason,
        note: dto.note ?? null,
        effect,
        dedupeKey,
      });
      this.logger.log(
        `intervention ${dto.type} by ${actor.userId} on ${this.targetIdFor(dto)}`,
      );
      return this.present(created.toObject() as never, false);
    } catch (error) {
      // Unique dedupeKey race: the effect already landed – return it.
      const replayed = await this.findExisting(dedupeKey);
      if (replayed) return replayed;
      throw error;
    }
  }

  private async contactParticipant(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.participantId) {
      throw new BusinessRuleException(
        'participantId is required for contact_participant',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    await this.alertModel.updateOne(
      { dedupeKey: this.dedupeKeyFor(dto) },
      {
        $setOnInsert: {
          userId: dto.participantId,
          programId: null,
          engagementId: null,
          type: AlertType.COORDINATOR_CONTACT,
          severity: AlertSeverity.INFO,
          title: 'A coordinator contacted you',
          message: dto.reason,
          readAt: null,
        },
      },
      { upsert: true },
    );
    return this.record(
      actor,
      { ...dto },
      { participantId: dto.participantId, notified: true },
      null,
    );
  }

  private async extendProposalExpiry(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.proposalId) {
      throw new BusinessRuleException(
        'proposalId is required for extend_proposal_expiry',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const replay = await this.findExisting(this.dedupeKeyFor(dto));
    if (replay) return replay;

    const proposal = await this.proposalModel.findById(dto.proposalId);
    if (!proposal) {
      throw new ResourceNotFoundException(
        'Match proposal not found',
        ErrorCode.RES_MENTORSHIP_PROPOSAL_NOT_FOUND,
      );
    }
    if (
      !(OPEN_PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)
    ) {
      throw new BusinessRuleException(
        `Proposal is ${proposal.status}; only open proposals can be extended`,
        ErrorCode.BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING,
      );
    }
    const newExpiresAt = dto.newExpiresAt
      ? new Date(dto.newExpiresAt)
      : new Date(
          Date.now() +
            (dto.extendHours ?? DEFAULT_EXTEND_HOURS) * 60 * 60 * 1000,
        );
    if (Number.isNaN(newExpiresAt.getTime()) || newExpiresAt <= new Date()) {
      throw new BusinessRuleException(
        'newExpiresAt must be a future timestamp',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const from = proposal.expiresAt;
    await this.proposalModel.updateOne(
      { _id: proposal._id, status: { $in: [...OPEN_PROPOSAL_STATUSES] } },
      {
        $set: { expiresAt: newExpiresAt },
        $push: {
          history: {
            action: 'extend_expiry',
            actorId: actor.userId,
            actorRole: actor.platformRole,
            reason: dto.reason,
            termsVersion: null,
            at: new Date(),
          },
        },
      },
    );
    return this.record(
      actor,
      dto,
      { from: from.toISOString(), to: newExpiresAt.toISOString() },
      proposal.programId,
    );
  }

  private async expireProposal(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.proposalId) {
      throw new BusinessRuleException(
        'proposalId is required for expire_proposal',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const replay = await this.findExisting(this.dedupeKeyFor(dto));
    if (replay) return replay;

    const proposal = await this.proposalModel.findById(dto.proposalId);
    if (!proposal) {
      throw new ResourceNotFoundException(
        'Match proposal not found',
        ErrorCode.RES_MENTORSHIP_PROPOSAL_NOT_FOUND,
      );
    }
    if (
      !(OPEN_PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)
    ) {
      throw new BusinessRuleException(
        `Proposal is ${proposal.status}; only open proposals can be expired`,
        ErrorCode.BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING,
      );
    }
    const now = new Date();
    const closed = await this.proposalModel.updateOne(
      { _id: proposal._id, status: { $in: [...OPEN_PROPOSAL_STATUSES] } },
      {
        $set: {
          status: ProposalStatus.EXPIRED,
          closedBy: actor.userId,
          closedReason: dto.reason,
          closedAt: now,
        },
        $unset: { openKey: 1 },
        $push: {
          history: {
            action: 'expire',
            actorId: actor.userId,
            actorRole: actor.platformRole,
            reason: dto.reason,
            termsVersion: null,
            at: now,
          },
        },
      },
    );
    if (closed.modifiedCount === 0) {
      throw new BusinessRuleException(
        'Proposal already closed concurrently',
        ErrorCode.BIZ_MENTORSHIP_PROPOSAL_NOT_PENDING,
      );
    }
    // Release any capacity reservation (mirrors MentorshipCapacityService).
    let capacityReleased = false;
    if (proposal.capacityReserved) {
      const cleared = await this.proposalModel.updateOne(
        { _id: proposal._id, capacityReserved: true },
        { $set: { capacityReserved: false } },
      );
      if (cleared.modifiedCount === 1) {
        await this.profileModel.updateOne(
          {
            userId: proposal.mentorId,
            kind: ParticipantRole.MENTOR,
            reservedSlots: { $gt: 0 },
          },
          { $inc: { reservedSlots: -1 } },
        );
        capacityReleased = true;
      }
    }
    return this.record(
      actor,
      dto,
      {
        expiredAt: now.toISOString(),
        capacityReleased,
        mentor: { userId: proposal.mentorId },
        mentee: { userId: proposal.menteeId },
      },
      proposal.programId,
    );
  }

  private async escalateDispute(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.disputeId) {
      throw new BusinessRuleException(
        'disputeId is required for escalate_dispute',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const replay = await this.findExisting(this.dedupeKeyFor(dto));
    if (replay) return replay;

    const dispute = await this.disputeModel.findById(dto.disputeId);
    if (!dispute) {
      throw new ResourceNotFoundException(
        'Dispute not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    if (dispute.status !== DisputeStatus.OPEN) {
      throw new BusinessRuleException(
        `Dispute is ${dispute.status}; only open disputes can be escalated`,
        ErrorCode.BIZ_MENTORSHIP_INVALID_TRANSITION,
      );
    }
    await this.disputeModel.updateOne(
      { _id: dispute._id, status: DisputeStatus.OPEN },
      { $set: { status: DisputeStatus.IN_REVIEW } },
    );
    await this.notifyParticipants(dispute, {
      type: AlertType.DISPUTE_ESCALATED,
      severity: AlertSeverity.WARNING,
      title: 'Your dispute is now under coordinator review',
      dedupePrefix: `dispute_escalated:${String(dispute._id)}`,
    });
    return this.record(
      actor,
      dto,
      { from: DisputeStatus.OPEN, to: DisputeStatus.IN_REVIEW },
      dispute.programId,
    );
  }

  private async resolveDispute(
    actor: MentorshipActor,
    dto: CreateInterventionDto,
  ): Promise<Record<string, unknown>> {
    if (!dto.disputeId) {
      throw new BusinessRuleException(
        'disputeId is required for resolve_dispute',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    if (!dto.resolution?.trim()) {
      throw new BusinessRuleException(
        'A resolution note is required to resolve a dispute',
        ErrorCode.VAL_MENTORSHIP_REASON_REQUIRED,
      );
    }
    const replay = await this.findExisting(this.dedupeKeyFor(dto));
    if (replay) return replay;

    const dispute = await this.disputeModel.findById(dto.disputeId);
    if (!dispute) {
      throw new ResourceNotFoundException(
        'Dispute not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    if (
      dispute.status !== DisputeStatus.OPEN &&
      dispute.status !== DisputeStatus.IN_REVIEW
    ) {
      throw new BusinessRuleException(
        `Dispute is already ${dispute.status}`,
        ErrorCode.BIZ_MENTORSHIP_INVALID_TRANSITION,
      );
    }
    const now = new Date();
    await this.disputeModel.updateOne(
      {
        _id: dispute._id,
        status: { $in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW] },
      },
      {
        $set: {
          status: DisputeStatus.RESOLVED,
          resolution: dto.resolution,
          resolvedBy: actor.userId,
          resolvedAt: now,
        },
        $unset: { activeKey: 1 },
      },
    );
    await this.notifyParticipants(dispute, {
      type: AlertType.DISPUTE_ESCALATED,
      severity: AlertSeverity.INFO,
      title: 'Your dispute has been resolved',
      dedupePrefix: `dispute_resolved:${String(dispute._id)}`,
    });
    return this.record(
      actor,
      dto,
      {
        from: dispute.status,
        to: DisputeStatus.RESOLVED,
        resolvedAt: now.toISOString(),
      },
      dispute.programId,
    );
  }

  /** Notifies both sides with opaque, deduplicated alerts. */
  private async notifyParticipants(
    dispute: {
      raisedBy: string;
      againstId: string;
      _id: unknown;
    },
    spec: {
      type: AlertType;
      severity: AlertSeverity;
      title: string;
      dedupePrefix: string;
    },
  ): Promise<void> {
    for (const userId of [dispute.raisedBy, dispute.againstId]) {
      await this.alertModel.updateOne(
        { dedupeKey: `${spec.dedupePrefix}:${userId}` },
        {
          $setOnInsert: {
            userId,
            programId: null,
            engagementId: null,
            type: spec.type,
            severity: spec.severity,
            title: spec.title,
            message: '',
            readAt: null,
          },
        },
        { upsert: true },
      );
    }
  }
}
