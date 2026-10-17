import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EngagementStatus,
  HardCheck,
  pairKey,
  ParticipantRole,
  SoftCheck,
} from './mentorship.constants';
import {
  MentorshipBlock,
  MentorshipBlockDocument,
} from './schemas/mentorship-block.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementDocument,
} from './schemas/mentorship-engagement.schema';
import {
  MentorshipProfile,
  MentorshipProfileDocument,
} from './schemas/mentorship-profile.schema';
import type { CompatibilityReason } from './schemas/match-proposal.schema';

export interface MatchCandidate {
  mentorId: string;
  menteeId: string;
  programId: string;
}

export interface EligibilityResult {
  hardFailures: HardCheck[];
  softFailures: SoftCheck[];
  compatibilityReasons: CompatibilityReason[];
}

/**
 * Evaluates whether two users may be matched in a program. Pure read: it
 * never mutates state, so callers can re-run it freely (retries, re-checks
 * before activation).
 */
@Injectable()
export class MentorshipEligibilityService {
  constructor(
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfileDocument>,
    @InjectModel(MentorshipBlock.name)
    private readonly blockModel: Model<MentorshipBlockDocument>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagementDocument>,
  ) {}

  async evaluate(candidate: MatchCandidate): Promise<EligibilityResult> {
    const { mentorId, menteeId, programId } = candidate;
    const hard: HardCheck[] = [];
    const soft: SoftCheck[] = [];
    const reasons: CompatibilityReason[] = [];

    if (mentorId === menteeId) {
      return {
        hardFailures: [HardCheck.SELF_MATCH],
        softFailures: [],
        compatibilityReasons: [],
      };
    }

    const [mentor, mentee, blocked, engaged] = await Promise.all([
      this.profileModel
        .findOne({ userId: mentorId, kind: ParticipantRole.MENTOR })
        .lean(),
      this.profileModel
        .findOne({ userId: menteeId, kind: ParticipantRole.MENTEE })
        .lean(),
      this.isBlockedPair(mentorId, menteeId),
      this.engagementModel.exists({
        activeKey: pairKey(mentorId, menteeId, programId),
        status: EngagementStatus.ACTIVE,
      }),
    ]);

    if (!mentor) {
      hard.push(HardCheck.MENTOR_PROFILE_MISSING);
    } else {
      if (!mentor.eligible) hard.push(HardCheck.MENTOR_INELIGIBLE);
      if (!mentor.programIds.includes(programId)) {
        hard.push(HardCheck.MENTOR_NOT_IN_PROGRAM);
      }
      if (mentor.reservedSlots >= mentor.maxActiveMentees) {
        hard.push(HardCheck.MENTOR_AT_CAPACITY);
      }
      if (!mentor.acceptingMentees) soft.push(SoftCheck.MENTOR_NOT_ACCEPTING);
    }

    if (!mentee) {
      hard.push(HardCheck.MENTEE_PROFILE_MISSING);
    } else {
      if (!mentee.eligible) hard.push(HardCheck.MENTEE_INELIGIBLE);
      if (!mentee.programIds.includes(programId)) {
        hard.push(HardCheck.MENTEE_NOT_IN_PROGRAM);
      }
    }

    if (blocked) hard.push(HardCheck.BLOCKED);
    if (engaged) hard.push(HardCheck.ALREADY_ENGAGED);

    if (mentor && mentee) {
      const menteeAreas = new Set(mentee.focusAreas.map(normalise));
      const shared = mentor.focusAreas.filter((area) =>
        menteeAreas.has(normalise(area)),
      );
      if (shared.length === 0) {
        soft.push(SoftCheck.NO_SHARED_FOCUS_AREA);
      }
      for (const area of shared) {
        reasons.push({
          code: 'shared_focus_area',
          detail: `Both participants list "${area}"`,
        });
      }
      if (
        mentor.programIds.includes(programId) &&
        mentee.programIds.includes(programId)
      ) {
        reasons.push({
          code: 'same_program',
          detail: `Both participants are enrolled in ${programId}`,
        });
      }
    }

    return { hardFailures: hard, softFailures: soft, compatibilityReasons: reasons };
  }

  /** True when either user has blocked the other. */
  async isBlockedPair(a: string, b: string): Promise<boolean> {
    const found = await this.blockModel.exists({
      $or: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    });
    return Boolean(found);
  }
}

const normalise = (value: string) => value.trim().toLowerCase();
