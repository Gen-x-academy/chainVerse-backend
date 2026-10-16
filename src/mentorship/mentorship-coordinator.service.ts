import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CoordinatorCreateProposalDto,
  OverrideReportQueryDto,
} from './dto/coordinator-proposal.dto';
import type { CoordinatorQueryProposalsDto } from './dto/query-proposals.dto';
import { MatchProposalService } from './match-proposal.service';
import { InitiatorKind } from './mentorship.constants';
import type { MentorshipActor, ProposalRecord } from './mentorship.policy';
import {
  MatchProposal,
  MatchProposalDocument,
} from './schemas/match-proposal.schema';

/**
 * Coordinator-assisted matching (MENTOR-039).
 *
 * Coordinators can propose, adjust, reassign and withdraw matches, and
 * override *soft* preference checks with a recorded reason. They can never
 * bypass hard eligibility or blocks, and they never approve on a
 * participant's behalf — every coordinator change needs participant consent.
 */
@Injectable()
export class MentorshipCoordinatorService {
  constructor(
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposalDocument>,
    private readonly proposals: MatchProposalService,
  ) {}

  create(dto: CoordinatorCreateProposalDto, actor: MentorshipActor) {
    const { reason, internalNote, overrides, supersedesProposalId, ...base } = dto;
    return this.proposals.create(
      {
        ...base,
        initiatorKind: InitiatorKind.COORDINATOR,
        coordinator: { reason, internalNote },
        overrides,
        supersedesProposalId,
      },
      actor,
    );
  }

  list(query: CoordinatorQueryProposalsDto) {
    const filter: Record<string, unknown> = {};
    if (query.mentorId) filter.mentorId = query.mentorId;
    if (query.menteeId) filter.menteeId = query.menteeId;
    if (query.programId) filter.programId = query.programId;
    return this.proposals.list(filter, query, true);
  }

  /**
   * Every proposal created with at least one soft-check override, with
   * totals by check and by coordinator for the same window.
   */
  async overrideReport(query: OverrideReportQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const match: Record<string, unknown> = {
      'overrides.0': { $exists: true },
    };
    if (query.from || query.to) {
      match.createdAt = {
        ...(query.from && { $gte: query.from }),
        ...(query.to && { $lt: query.to }),
      };
    }
    if (query.coordinatorId) match['overrides.coordinatorId'] = query.coordinatorId;
    if (query.check) match['overrides.check'] = query.check;

    const [rows, total, byCheck, byCoordinator] = await Promise.all([
      this.proposalModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ProposalRecord[]>(),
      this.proposalModel.countDocuments(match),
      this.proposalModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $unwind: '$overrides' },
        { $group: { _id: '$overrides.check', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.proposalModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $unwind: '$overrides' },
        { $group: { _id: '$overrides.coordinatorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      data: rows.map((p) => ({
        proposalId: p._id.toString(),
        mentorId: p.mentorId,
        menteeId: p.menteeId,
        programId: p.programId,
        status: p.status,
        coordinator: p.coordinator,
        overrides: p.overrides,
        engagementId: p.engagementId,
        createdAt: p.createdAt,
      })),
      summary: {
        byCheck: byCheck.map((r) => ({ check: r._id, count: r.count })),
        byCoordinator: byCoordinator.map((r) => ({
          coordinatorId: r._id,
          count: r.count,
        })),
      },
      meta: { page, limit, total },
    };
  }
}
