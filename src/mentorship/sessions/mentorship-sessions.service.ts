import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import {
  CancelSessionActorType,
  CancelSessionDto,
} from './dto/cancel-session.dto';
import { CreateMentorshipSessionDto } from './dto/create-session.dto';
import {
  MentorshipSession,
  MentorshipSessionDocument,
  MentorshipSessionStatus,
} from './schemas/mentorship-session.schema';

export interface CancelSessionCommand extends CancelSessionDto {
  actorId: string;
}

@Injectable()
export class MentorshipSessionsService {
  constructor(
    @InjectModel(MentorshipSession.name)
    private readonly sessions: Model<MentorshipSessionDocument>,
  ) {}

  async create(dto: CreateMentorshipSessionDto) {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      throw new BadRequestException(
        'scheduledStart must be before scheduledEnd',
      );
    }

    const existing = await this.sessions
      .findOne({
        agreementId: dto.agreementId,
        idempotencyKey: dto.idempotencyKey,
      })
      .exec();
    if (existing) return existing;

    try {
      return await this.sessions.create({
        agreementId: dto.agreementId,
        mentorId: dto.mentorId,
        menteeId: dto.menteeId,
        scheduledStart: start,
        scheduledEnd: end,
        status: MentorshipSessionStatus.BOOKED,
        cancellation: null,
        idempotencyKey: dto.idempotencyKey,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.sessions
          .findOne({
            agreementId: dto.agreementId,
            idempotencyKey: dto.idempotencyKey,
          })
          .exec();
        if (winner) return winner;
      }
      throw err;
    }
  }

  async findOne(id: string) {
    const session = await this.sessions.findById(id).exec();
    if (!session) throw new NotFoundException('MENTORSHIP_SESSION_NOT_FOUND');
    return session;
  }

  private assertActorAllowed(
    session: MentorshipSessionDocument,
    cmd: CancelSessionCommand,
  ) {
    if (cmd.actorType === CancelSessionActorType.STAFF) return;
    const isMentor =
      cmd.actorType === CancelSessionActorType.MENTOR &&
      cmd.actorId === session.mentorId;
    const isMentee =
      cmd.actorType === CancelSessionActorType.MENTEE &&
      cmd.actorId === session.menteeId;
    if (!isMentor && !isMentee) {
      throw new ForbiddenException('MENTORSHIP_SESSION_CANCEL_FORBIDDEN');
    }
  }

  private computeNoticeMinutes(
    session: MentorshipSessionDocument,
    now: Date,
  ): number {
    const diffMs = session.scheduledStart.getTime() - now.getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  private feeConsequence(noticeMinutes: number): string {
    if (noticeMinutes >= 24 * 60) return 'no_fee';
    if (noticeMinutes > 0) return 'late_cancel_fee';
    return 'post_start_policy_review';
  }

  async cancel(sessionId: string, cmd: CancelSessionCommand, now = new Date()) {
    const session = await this.findOne(sessionId);
    this.assertActorAllowed(session, cmd);

    if (session.status === MentorshipSessionStatus.CANCELLED) {
      // Idempotent: retries return the canonical cancellation record.
      return session;
    }
    if (session.status !== MentorshipSessionStatus.BOOKED) {
      throw new BadRequestException('MENTORSHIP_SESSION_NOT_CANCELLABLE');
    }

    const noticePeriodMinutes = this.computeNoticeMinutes(session, now);
    const policyVersion = cmd.policyVersion ?? '2026-01';
    const instructionId = createHash('sha256')
      .update(`${session.id}:${cmd.idempotencyKey}:cancel`)
      .digest('hex');

    const cancellation = {
      actorType: cmd.actorType,
      actorId: cmd.actorId,
      reason: cmd.reason,
      policyVersion,
      noticePeriodMinutes,
      feeConsequence: this.feeConsequence(noticePeriodMinutes),
      cancelledAt: now,
      instructionId,
    };

    const updated = await this.sessions
      .findOneAndUpdate(
        { _id: session.id, status: MentorshipSessionStatus.BOOKED },
        {
          $set: {
            status: MentorshipSessionStatus.CANCELLED,
            cancellation,
          },
        },
        { new: true },
      )
      .exec();

    if (updated) return updated;

    const latest = await this.findOne(sessionId);
    if (latest.status === MentorshipSessionStatus.CANCELLED) return latest;
    throw new BadRequestException('MENTORSHIP_SESSION_NOT_CANCELLABLE');
  }
}
