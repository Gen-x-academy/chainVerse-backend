import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EngagementStatus,
  OPEN_PROPOSAL_STATUSES,
  ParticipantRole,
  ProposalStatus,
} from './mentorship.constants';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import type { ProposalRecord } from './mentorship.policy';
import {
  MatchProposal,
  MatchProposalDocument,
} from './schemas/match-proposal.schema';
import {
  MentorshipEngagement,
  MentorshipEngagementDocument,
} from './schemas/mentorship-engagement.schema';
import {
  MentorshipProfile,
  MentorshipProfileDocument,
} from './schemas/mentorship-profile.schema';

/**
 * Mentor capacity bookkeeping.
 *
 * `MentorshipProfile.reservedSlots` counts active engagements plus open
 * proposals with `capacityReserved: true`. Every change is a single
 * conditional update, so concurrent approvals can never push a mentor past
 * `maxActiveMentees`; the proposal-side flag makes reserve and release
 * idempotent under retries.
 */
@Injectable()
export class MentorshipCapacityService {
  /** Drift seen on the previous sweep, keyed by mentor id. */
  private readonly pendingDrift = new Map<string, string>();

  constructor(
    @InjectModel(MentorshipProfile.name)
    private readonly profileModel: Model<MentorshipProfileDocument>,
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposalDocument>,
    @InjectModel(MentorshipEngagement.name)
    private readonly engagementModel: Model<MentorshipEngagementDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /** Reserves one slot for the proposal. Returns false when the mentor is full or ineligible. */
  async reserve(proposal: ProposalRecord): Promise<boolean> {
    if (proposal.capacityReserved) return true;

    const slot = await this.profileModel.updateOne(
      {
        userId: proposal.mentorId,
        kind: ParticipantRole.MENTOR,
        eligible: true,
        $expr: { $lt: ['$reservedSlots', '$maxActiveMentees'] },
      },
      { $inc: { reservedSlots: 1 } },
    );
    if (slot.modifiedCount === 0) return false;

    const flagged = await this.proposalModel.updateOne(
      {
        _id: proposal._id,
        capacityReserved: false,
        status: { $in: [...OPEN_PROPOSAL_STATUSES] },
      },
      { $set: { capacityReserved: true } },
    );
    if (flagged.modifiedCount === 1) return true;

    // A concurrent request already reserved (or the proposal closed): give
    // back the slot we just took and report the proposal's real state.
    await this.releaseSlot(proposal.mentorId);
    const fresh = await this.proposalModel
      .findById(proposal._id, { capacityReserved: 1, status: 1 })
      .lean();
    return Boolean(
      fresh?.capacityReserved &&
        (OPEN_PROPOSAL_STATUSES as readonly string[]).includes(fresh.status),
    );
  }

  /** Releases the proposal's slot if it holds one. Safe to call repeatedly. */
  async release(proposal: Pick<ProposalRecord, '_id' | 'mentorId'>): Promise<void> {
    const cleared = await this.proposalModel.updateOne(
      {
        _id: proposal._id,
        capacityReserved: true,
        status: { $ne: ProposalStatus.ACCEPTED },
      },
      { $set: { capacityReserved: false } },
    );
    if (cleared.modifiedCount === 1) {
      await this.releaseSlot(proposal.mentorId);
    }
  }

  private async releaseSlot(mentorId: string): Promise<void> {
    await this.profileModel.updateOne(
      {
        userId: mentorId,
        kind: ParticipantRole.MENTOR,
        reservedSlots: { $gt: 0 },
      },
      { $inc: { reservedSlots: -1 } },
    );
  }

  /**
   * Recomputes `reservedSlots` from source data and repairs drift left by
   * crashes between the two halves of a reserve/release. A correction is
   * only applied when the same drift is observed on two consecutive sweeps,
   * so an in-flight reservation is never mistaken for drift.
   */
  async reconcile(): Promise<number> {
    const [engaged, held] = await Promise.all([
      this.engagementModel.aggregate<{ _id: string; n: number }>([
        { $match: { status: EngagementStatus.ACTIVE } },
        { $group: { _id: '$mentorId', n: { $sum: 1 } } },
      ]),
      this.proposalModel.aggregate<{ _id: string; n: number }>([
        {
          $match: {
            capacityReserved: true,
            status: { $in: [...OPEN_PROPOSAL_STATUSES] },
          },
        },
        { $group: { _id: '$mentorId', n: { $sum: 1 } } },
      ]),
    ]);

    const expected = new Map<string, number>();
    for (const row of [...engaged, ...held]) {
      expected.set(row._id, (expected.get(row._id) ?? 0) + row.n);
    }

    const mentors = await this.profileModel
      .find(
        {
          kind: ParticipantRole.MENTOR,
          $or: [
            { reservedSlots: { $gt: 0 } },
            { userId: { $in: [...expected.keys()] } },
          ],
        },
        { userId: 1, reservedSlots: 1 },
      )
      .lean();

    let corrected = 0;
    const seen = new Set<string>();
    for (const mentor of mentors) {
      const want = expected.get(mentor.userId) ?? 0;
      if (mentor.reservedSlots === want) {
        this.pendingDrift.delete(mentor.userId);
        continue;
      }
      const signature = `${mentor.reservedSlots}->${want}`;
      seen.add(mentor.userId);
      if (this.pendingDrift.get(mentor.userId) !== signature) {
        this.pendingDrift.set(mentor.userId, signature);
        continue;
      }
      const res = await this.profileModel.updateOne(
        {
          userId: mentor.userId,
          kind: ParticipantRole.MENTOR,
          reservedSlots: mentor.reservedSlots,
        },
        { $set: { reservedSlots: want } },
      );
      this.pendingDrift.delete(mentor.userId);
      if (res.modifiedCount === 1) {
        corrected += 1;
        this.telemetry.capacityDrift({
          mentorId: mentor.userId,
          from: mentor.reservedSlots,
          to: want,
        });
      }
    }
    for (const key of this.pendingDrift.keys()) {
      if (!seen.has(key)) this.pendingDrift.delete(key);
    }
    return corrected;
  }
}
