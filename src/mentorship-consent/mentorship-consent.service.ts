import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipSessionConsent,
  MentorshipSessionConsentDocument,
  RecordingMode,
  ConsentStatus,
} from './schemas/mentorship-session-consent.schema';
import {
  MentorshipDispute,
  MentorshipDisputeDocument,
  DisputeStatus,
} from './schemas/mentorship-dispute.schema';
import { ConsentDto, DisputeDto } from './dto/mentorship-consent.dto';

@Injectable()
export class MentorshipConsentService {
  constructor(
    @InjectModel(MentorshipSessionConsent.name)
    private readonly consents: Model<MentorshipSessionConsentDocument>,
    @InjectModel(MentorshipDispute.name)
    private readonly disputes: Model<MentorshipDisputeDocument>,
  ) {}

  async setConsent(actorId: string, dto: ConsentDto) {
    if (dto.participantId !== actorId)
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    const existing = await this.consents
      .findOne({ sessionId: dto.sessionId, participantId: dto.participantId })
      .exec();
    if (
      existing &&
      existing.mode === RecordingMode.REQUIRED &&
      dto.status === ConsentStatus.REVOKED
    ) {
      throw new BadRequestException('CANNOT_REVOKE_REQUIRED_CONSENT');
    }
    return this.consents
      .findOneAndUpdate(
        { sessionId: dto.sessionId, participantId: dto.participantId },
        {
          $set: {
            mode: dto.mode,
            status: dto.status ?? 'granted',
            isMinor: dto.isMinor ?? false,
            retentionPolicy: dto.retentionPolicy ?? null,
            grantedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async revoke(actorId: string, sessionId: string) {
    const c = await this.consents
      .findOne({ sessionId, participantId: actorId })
      .exec();
    if (!c) throw new NotFoundException('CONSENT_NOT_FOUND');
    if (c.mode === RecordingMode.REQUIRED)
      throw new BadRequestException('CANNOT_REVOKE_REQUIRED_CONSENT');
    return this.consents
      .findByIdAndUpdate(
        c.id,
        { $set: { status: ConsentStatus.REVOKED, revokedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async createDispute(dto: DisputeDto) {
    const due = new Date(dto.dueAt);
    if (Number.isNaN(due.getTime()))
      throw new BadRequestException('INVALID_DUE_DATE');
    return this.disputes.create({
      ...dto,
      dueAt: due,
      status: DisputeStatus.OPEN,
    });
  }

  async respondDispute(
    disputeId: string,
    responderId: string,
    response: string,
  ) {
    const d = await this.disputes.findById(disputeId).exec();
    if (!d) throw new NotFoundException('DISPUTE_NOT_FOUND');
    if (
      d.status !== DisputeStatus.OPEN &&
      d.status !== DisputeStatus.RESPONDED
    ) {
      throw new BadRequestException('DISPUTE_ALREADY_CLOSED');
    }
    return this.disputes
      .findByIdAndUpdate(
        disputeId,
        {
          $set: {
            status: DisputeStatus.RESPONDED,
            respondentId: responderId,
            response,
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async resolveDispute(disputeId: string, resolverId: string) {
    const d = await this.disputes.findById(disputeId).exec();
    if (!d) throw new NotFoundException('DISPUTE_NOT_FOUND');
    return this.disputes
      .findByIdAndUpdate(
        disputeId,
        {
          $set: {
            status: DisputeStatus.RESOLVED,
            resolvedBy: resolverId,
            resolvedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async listDisputesForSession(sessionId: string) {
    return this.disputes.find({ sessionId }).sort({ createdAt: -1 }).exec();
  }
}
