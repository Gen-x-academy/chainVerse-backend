import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditAction } from '../common/audit/audit-action.enum';
import { AuditService } from '../common/audit/audit.service';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ValidationDomainException } from '../common/errors/domain.exception';
import type {
  CreateBlockDto,
  SetEligibilityDto,
  UpsertMentorshipProfileDto,
} from './dto/mentorship-profile.dto';
import { MatchProposalService } from './match-proposal.service';
import {
  PARTICIPANT_PLATFORM_ROLE,
  ParticipantRole,
} from './mentorship.constants';
import { MentorshipErrors } from './mentorship.errors';
import type { MentorshipActor } from './mentorship.policy';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import {
  MentorshipBlock,
  MentorshipBlockDocument,
} from './schemas/mentorship-block.schema';
import {
  MentorshipProfile,
  MentorshipProfileDocument,
} from './schemas/mentorship-profile.schema';

type ProfileRecord = MentorshipProfile & { _id: Types.ObjectId };

/** Participant opt-in profiles, coordinator eligibility decisions, and blocks. */
@Injectable()
export class MentorshipProfileService {
  constructor(
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfileDocument>,
    @InjectModel(MentorshipBlock.name)
    private readonly blockModel: Model<MentorshipBlockDocument>,
    private readonly proposals: MatchProposalService,
    private readonly auditService: AuditService,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  async upsertOwn(dto: UpsertMentorshipProfileDto, actor: MentorshipActor) {
    const requiredRole = PARTICIPANT_PLATFORM_ROLE[dto.kind];
    if (actor.platformRole !== requiredRole) {
      throw this.telemetry.fail(
        MentorshipErrors.profileRoleMismatch(dto.kind, requiredRole),
      );
    }

    const set: Record<string, unknown> = {
      focusAreas: dto.focusAreas,
      programIds: dto.programIds,
    };
    if (dto.kind === ParticipantRole.MENTOR) {
      if (dto.maxActiveMentees !== undefined) {
        set.maxActiveMentees = dto.maxActiveMentees;
      }
      if (dto.acceptingMentees !== undefined) {
        set.acceptingMentees = dto.acceptingMentees;
      }
    }

    const profile = await this.profileModel
      .findOneAndUpdate(
        { userId: actor.userId, kind: dto.kind },
        {
          $set: set,
          // Mentors need coordinator approval; mentees are eligible by default.
          $setOnInsert: {
            eligible: dto.kind === ParticipantRole.MENTEE,
            reservedSlots: 0,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<ProfileRecord>();
    return toProfileView(profile!);
  }

  async getOwn(kind: ParticipantRole, actor: MentorshipActor) {
    const profile = await this.profileModel
      .findOne({ userId: actor.userId, kind })
      .lean<ProfileRecord>();
    if (!profile) throw this.telemetry.fail(MentorshipErrors.profileNotFound(kind));
    return toProfileView(profile);
  }

  /**
   * Coordinator decision on hard eligibility. Revoking eligibility withdraws
   * the user's open proposals on that side and frees their capacity holds.
   */
  async setEligibility(userId: string, dto: SetEligibilityDto, actor: MentorshipActor) {
    const before = await this.profileModel
      .findOne({ userId, kind: dto.kind })
      .lean<ProfileRecord>();
    if (!before) throw this.telemetry.fail(MentorshipErrors.profileNotFound(dto.kind));
    if (before.eligible === dto.eligible) return toProfileView(before);

    const after = await this.profileModel
      .findOneAndUpdate(
        { userId, kind: dto.kind },
        {
          $set: {
            eligible: dto.eligible,
            eligibilityReason: dto.reason,
            eligibilityChangedBy: actor.userId,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<ProfileRecord>();

    await this.auditService.record({
      action: AuditAction.MENTORSHIP_PROFILE_ELIGIBILITY_CHANGED,
      context: actor.audit,
      target: { type: 'mentorship_profile', id: before._id.toString() },
      before: { userId, kind: dto.kind, eligible: before.eligible },
      after: { userId, kind: dto.kind, eligible: dto.eligible },
      reason: dto.reason,
    });

    if (!dto.eligible) {
      await this.proposals.closeOpenFor(
        userId,
        dto.kind,
        { actorId: actor.userId, actorRole: actor.platformRole, audit: actor.audit },
        `${dto.kind}_ineligible`,
      );
    }
    return toProfileView(after!);
  }

  async block(dto: CreateBlockDto, actor: MentorshipActor) {
    if (dto.userId === actor.userId) {
      throw new ValidationDomainException(
        'You cannot block yourself',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    const block = await this.blockModel
      .findOneAndUpdate(
        { blockerId: actor.userId, blockedId: dto.userId },
        { $setOnInsert: { reason: dto.reason ?? null } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean();
    await this.proposals.closeOpenBetween(
      actor.userId,
      dto.userId,
      { actorId: actor.userId, actorRole: actor.platformRole, audit: actor.audit },
      // The reason recorded on shared proposals stays generic on purpose.
      'participant_unavailable',
    );
    return { blockedUserId: block!.blockedId, createdAt: block!.createdAt };
  }

  async unblock(userId: string, actor: MentorshipActor): Promise<void> {
    await this.blockModel.deleteOne({ blockerId: actor.userId, blockedId: userId });
  }

  async listBlocks(actor: MentorshipActor) {
    const rows = await this.blockModel
      .find({ blockerId: actor.userId })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((b) => ({
      blockedUserId: b.blockedId,
      reason: b.reason,
      createdAt: b.createdAt,
    }));
  }
}

function toProfileView(profile: ProfileRecord) {
  const base = {
    userId: profile.userId,
    kind: profile.kind,
    focusAreas: profile.focusAreas,
    programIds: profile.programIds,
    eligible: profile.eligible,
    eligibilityReason: profile.eligibilityReason,
    updatedAt: profile.updatedAt,
  };
  if (profile.kind !== ParticipantRole.MENTOR) return base;
  return {
    ...base,
    acceptingMentees: profile.acceptingMentees,
    maxActiveMentees: profile.maxActiveMentees,
    reservedSlots: profile.reservedSlots,
  };
}
