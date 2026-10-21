import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes.enum';
import type { MentorshipActor } from '../../mentorship.policy';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { DisputeStatus } from '../enums/mentorship-operations.enums';
import { MentorshipOpsDispute } from '../schemas/mentorship-ops-dispute.schema';
import { MentorshipEngagement } from '../../schemas/mentorship-engagement.schema';

/**
 * Participant-facing dispute surface (part of MENTOR-116 / issue #1434).
 *
 * Only the two participants on an engagement may raise a dispute against it;
 * the partial unique `activeKey` index makes "one open dispute per engagement
 * per raiser" an atomic database guarantee, so retried submissions can never
 * duplicate.
 */
@Injectable()
export class MentorshipDisputesService {
  constructor(
    @InjectModel(MentorshipOpsDispute.name)
    private readonly disputeModel: Model<MentorshipOpsDispute>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagement>,
  ) {}

  async raise(
    actor: MentorshipActor,
    dto: CreateDisputeDto,
  ): Promise<Record<string, unknown>> {
    const engagement = await this.engagementModel
      .findById(dto.engagementId)
      .lean();
    if (!engagement) {
      throw new ResourceNotFoundException(
        'Engagement not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    const isMentor = engagement.mentorId === actor.userId;
    const isMentee = engagement.menteeId === actor.userId;
    if (!isMentor && !isMentee) {
      throw new ForbiddenDomainException(
        'Only the participants of an engagement can raise a dispute for it',
        ErrorCode.AUTH_MENTORSHIP_NOT_PARTICIPANT,
      );
    }
    const againstId = isMentor ? engagement.menteeId : engagement.mentorId;
    const activeKey = `${dto.engagementId}:${actor.userId}`;
    try {
      const created = await this.disputeModel.create({
        engagementId: dto.engagementId,
        programId: engagement.programId,
        raisedBy: actor.userId,
        againstId,
        mentorId: engagement.mentorId,
        menteeId: engagement.menteeId,
        reason: dto.reason,
        details: dto.details ?? '',
        status: DisputeStatus.OPEN,
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
        activeKey,
      });
      return this.present(created.toObject());
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await this.disputeModel.findOne({ activeKey }).lean();
        if (existing) {
          throw new ResourceConflictException(
            'You already have an open dispute for this engagement',
            ErrorCode.RES_ALREADY_EXISTS,
            { disputeId: String(existing._id) },
          );
        }
      }
      throw error;
    }
  }

  async listMine(actor: MentorshipActor): Promise<Record<string, unknown>> {
    const rows = await this.disputeModel
      .find({ raisedBy: actor.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return {
      meta: { scope: { userId: actor.userId } },
      items: rows.map((row) => this.present(row)),
    };
  }

  /** Minimal projection: no coordinator notes, no counterpart details. */
  private present(row: {
    _id: unknown;
    engagementId: string;
    programId: string;
    reason: string;
    details?: string;
    status: DisputeStatus;
    resolution?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): Record<string, unknown> {
    return {
      id: String(row._id),
      engagementId: row.engagementId,
      programId: String(row.programId),
      reason: row.reason,
      details: row.details ?? '',
      status: row.status,
      resolution: row.resolution ?? null,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }
}
