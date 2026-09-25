import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CommitteeDecision,
  CommitteeDecisionDocument,
  CommitteeOutcome,
  CommitteeVote,
  DecisionVoteType,
} from '../schemas/committee-decision.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../schemas/scholarship-application.schema';
import {
  CastVoteDto,
  CommitteeDecisionResult,
  CommitteeVoteSummary,
  ListDecisionsQueryDto,
  OpenDecisionRoundDto,
  OverrideDecisionDto,
} from '../dto/committee-decision.dto';

// ── Error codes ───────────────────────────────────────────────────────────────

const ERR = {
  APPLICATION_NOT_FOUND: 'RES_SCHOLARSHIP_APPLICATION_NOT_FOUND',
  DECISION_NOT_FOUND: 'RES_COMMITTEE_DECISION_NOT_FOUND',
  DECISION_ALREADY_EXISTS: 'BIZ_DECISION_ALREADY_EXISTS',
  ALREADY_RECUSED: 'BIZ_ALREADY_RECUSED',
  OVERRIDE_OUTCOME_INVALID: 'BIZ_OVERRIDE_OUTCOME_INVALID',
} as const;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the effective (non-superseded) votes from `votes`.
 * Recused votes are always included in the effective set — they are filtered
 * separately during tally/quorum so they appear in the summary.
 */
function effectiveVotes(votes: CommitteeVote[]): CommitteeVote[] {
  return votes.filter((v) => !v.superseded);
}

/**
 * Eligible votes are effective votes whose type is NOT RECUSE.
 * These are the votes that count toward quorum and the tally.
 */
function eligibleVotes(votes: CommitteeVote[]): CommitteeVote[] {
  return effectiveVotes(votes).filter((v) => v.vote !== DecisionVoteType.RECUSE);
}

/**
 * Resolves the majority outcome from the eligible vote tally.
 *
 * Algorithm:
 *   1. Count votes for each DecisionVoteType (excluding RECUSE).
 *   2. Find the type with the highest count.
 *   3. If two or more types share the highest count → TIE.
 *   4. Otherwise map the winning type to the corresponding CommitteeOutcome.
 *
 * Vote-type → Outcome mapping:
 *   SHORTLIST → SHORTLIST
 *   WAITLIST  → WAITLIST
 *   AWARD     → AWARDED
 *   REJECT    → REJECTED
 */
function resolveOutcome(eligible: CommitteeVote[]): CommitteeOutcome {
  if (eligible.length === 0) return CommitteeOutcome.PENDING;

  const tally = new Map<DecisionVoteType, number>();
  for (const v of eligible) {
    tally.set(v.vote, (tally.get(v.vote) ?? 0) + 1);
  }

  let maxCount = 0;
  let winner: DecisionVoteType | null = null;
  let isTie = false;

  for (const [type, count] of tally) {
    if (count > maxCount) {
      maxCount = count;
      winner = type;
      isTie = false;
    } else if (count === maxCount) {
      isTie = true;
    }
  }

  if (isTie || winner === null) return CommitteeOutcome.TIE;

  const map: Record<DecisionVoteType, CommitteeOutcome> = {
    [DecisionVoteType.SHORTLIST]: CommitteeOutcome.SHORTLIST,
    [DecisionVoteType.WAITLIST]: CommitteeOutcome.WAITLIST,
    [DecisionVoteType.AWARD]: CommitteeOutcome.AWARDED,
    [DecisionVoteType.REJECT]: CommitteeOutcome.REJECTED,
    [DecisionVoteType.RECUSE]: CommitteeOutcome.PENDING, // excluded above, guard only
  };

  return map[winner];
}

/** Serialize a CommitteeDecision document into the API response shape. */
function toResult(doc: CommitteeDecisionDocument): CommitteeDecisionResult {
  const effective = effectiveVotes(doc.votes);
  const eligible = eligibleVotes(doc.votes);

  const votes: CommitteeVoteSummary[] = effective.map((v) => ({
    voteId: String(v._id),
    memberId: v.memberId,
    memberDisplayName: v.memberDisplayName,
    memberRole: v.memberRole,
    vote: v.vote,
    evidenceVersionId: v.evidenceVersionId,
    rationale: v.rationale,
    votedAt: v.votedAt.toISOString(),
    isAmendment: v.amendedFromVoteId !== null,
  }));

  return {
    decisionId: String(doc._id),
    organizationId: doc.organizationId,
    applicationId: String(doc.applicationId),
    programId: String(doc.programId),
    quorumRequired: doc.quorumRequired,
    quorumReached: eligible.length >= doc.quorumRequired,
    eligibleVoteCount: eligible.length,
    outcome: doc.outcome,
    resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null,
    resolvedBy: doc.resolvedBy,
    votes,
    overrideCount: doc.overrides.length,
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * CommitteeDecisionService manages the full lifecycle of a scholarship
 * application's committee decision process.
 *
 * Responsibilities:
 *   - Open a decision round (create CommitteeDecision document).
 *   - Accept votes (CastVoteDto), handle amendments and recusals.
 *   - Enforce quorum: re-evaluate and resolve outcome after every eligible vote.
 *   - Accept OWNER overrides at any time with mandatory justification.
 *   - Append every mutation to the immutable `auditTrail`.
 *   - Return serialized CommitteeDecisionResult objects to the controller.
 *
 * Tenant isolation:
 *   Every public method receives `organizationId` as its first argument.
 *   All Mongoose queries include `organizationId` so cross-tenant access is
 *   structurally impossible via this service.
 *
 * Privacy:
 *   Individual votes and the audit trail are staff-only data.  The controller
 *   layer is responsible for restricting these endpoints to appropriate roles.
 */
@Injectable()
export class CommitteeDecisionService {
  constructor(
    @InjectModel(CommitteeDecision.name)
    private readonly decisionModel: Model<CommitteeDecisionDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
  ) {}

  // ── Open a decision round ─────────────────────────────────────────────────

  /**
   * Opens a new committee decision round for the given application.
   *
   * Throws:
   *   - 404 RES_SCHOLARSHIP_APPLICATION_NOT_FOUND — application not found or
   *     not owned by this organization.
   *   - 409 BIZ_DECISION_ALREADY_EXISTS — a decision document already exists
   *     for this application.
   */
  async openDecisionRound(
    organizationId: string,
    applicationId: string,
    dto: OpenDecisionRoundDto,
    actorId: string,
    actorDisplayName?: string,
  ): Promise<CommitteeDecisionResult> {
    const application = await this.applicationModel
      .findOne({ _id: applicationId, organizationId })
      .exec();

    if (!application) {
      throw new NotFoundException(ERR.APPLICATION_NOT_FOUND);
    }

    const existing = await this.decisionModel
      .findOne({ applicationId, organizationId })
      .exec();

    if (existing) {
      throw new ConflictException(ERR.DECISION_ALREADY_EXISTS);
    }

    const now = new Date();
    const doc = await this.decisionModel.create({
      organizationId,
      applicationId: new Types.ObjectId(applicationId),
      programId: application.programId,
      quorumRequired: dto.quorumRequired,
      outcome: CommitteeOutcome.PENDING,
      resolvedAt: null,
      resolvedBy: null,
      votes: [],
      overrides: [],
      auditTrail: [
        {
          action: 'decision_round_opened',
          actorId,
          actorDisplayName: actorDisplayName ?? actorId,
          occurredAt: now,
          payload: { quorumRequired: dto.quorumRequired },
        },
      ],
    });

    return toResult(doc);
  }

  // ── Cast a vote ───────────────────────────────────────────────────────────

  /**
   * Records a committee member's vote (or amendment) on an application.
   *
   * Amendment logic:
   *   When `memberId` has already voted, the existing (non-superseded) vote
   *   is marked `superseded = true` and a new vote entry with
   *   `amendedFromVoteId` is appended.  A member who has RECUSED cannot amend
   *   to a substantive vote.
   *
   * Quorum evaluation:
   *   After every non-RECUSE vote the eligible vote count is compared against
   *   `quorumRequired`.  When quorum is reached the outcome is resolved by
   *   simple majority and the document is updated atomically.
   *
   * Throws:
   *   - 404 RES_COMMITTEE_DECISION_NOT_FOUND
   *   - 409 BIZ_ALREADY_RECUSED — member previously recused; cannot vote.
   */
  async castVote(
    organizationId: string,
    applicationId: string,
    memberId: string,
    dto: CastVoteDto,
    memberRole = 'member',
  ): Promise<CommitteeDecisionResult> {
    const doc = await this.decisionModel
      .findOne({ applicationId, organizationId })
      .exec();

    if (!doc) {
      throw new NotFoundException(ERR.DECISION_NOT_FOUND);
    }

    const now = new Date();
    const displayName = dto.memberDisplayName ?? memberId;

    // Find existing non-superseded vote by this member (if any).
    const previousVoteIdx = doc.votes.findIndex(
      (v) => v.memberId === memberId && !v.superseded,
    );
    const previousVote =
      previousVoteIdx !== -1 ? doc.votes[previousVoteIdx] : null;

    // Block recused members from casting a substantive vote.
    if (
      previousVote?.vote === DecisionVoteType.RECUSE &&
      dto.vote !== DecisionVoteType.RECUSE
    ) {
      throw new ConflictException(ERR.ALREADY_RECUSED);
    }

    let amendedFromVoteId: Types.ObjectId | null = null;

    if (previousVote) {
      // Mark previous vote as superseded.
      doc.votes[previousVoteIdx].superseded = true;
      amendedFromVoteId = previousVote._id;
    }

    // Append the new vote.
    const newVote: Partial<CommitteeVote> = {
      _id: new Types.ObjectId(),
      memberId,
      memberDisplayName: displayName,
      memberRole: memberRole,
      vote: dto.vote,
      evidenceVersionId: dto.evidenceVersionId,
      rationale: dto.rationale,
      amendedFromVoteId,
      superseded: false,
      votedAt: now,
    };

    doc.votes.push(newVote as CommitteeVote);

    // Append audit entry.
    const auditAction =
      dto.vote === DecisionVoteType.RECUSE
        ? 'vote_recused'
        : amendedFromVoteId
          ? 'vote_amended'
          : 'vote_cast';

    doc.auditTrail.push({
      action: auditAction,
      actorId: memberId,
      actorDisplayName: displayName,
      occurredAt: now,
      payload: {
        vote: dto.vote,
        evidenceVersionId: dto.evidenceVersionId,
        amendedFromVoteId: amendedFromVoteId ? String(amendedFromVoteId) : null,
      },
    });

    // Re-evaluate quorum & outcome when this is an eligible (non-recuse) vote.
    if (dto.vote !== DecisionVoteType.RECUSE) {
      const eligible = eligibleVotes(doc.votes);
      if (
        eligible.length >= doc.quorumRequired &&
        doc.outcome === CommitteeOutcome.PENDING
      ) {
        const resolved = resolveOutcome(eligible);
        doc.outcome = resolved;
        doc.resolvedAt = now;
        doc.resolvedBy = memberId;

        doc.auditTrail.push({
          action: 'outcome_resolved',
          actorId: memberId,
          actorDisplayName: displayName,
          occurredAt: now,
          payload: {
            outcome: resolved,
            eligibleVoteCount: eligible.length,
            quorumRequired: doc.quorumRequired,
          },
        });
      }
    }

    await doc.save();
    return toResult(doc);
  }

  // ── Override outcome ──────────────────────────────────────────────────────

  /**
   * Applies a manual override to the resolved (or pending) outcome.
   *
   * The override does not erase the vote history.  It appends an entry to
   * `overrides`, sets `outcome` to OVERRIDE, and records the superseded
   * outcome in `overriddenOutcome`.  The audit trail is also updated.
   *
   * Throws:
   *   - 404 RES_COMMITTEE_DECISION_NOT_FOUND
   *   - 422 BIZ_OVERRIDE_OUTCOME_INVALID — `newOutcome` is PENDING or OVERRIDE
   *     without a substantive terminal state.
   */
  async overrideOutcome(
    organizationId: string,
    applicationId: string,
    actorId: string,
    dto: OverrideDecisionDto,
    actorDisplayName?: string,
  ): Promise<CommitteeDecisionResult> {
    if (dto.newOutcome === CommitteeOutcome.PENDING) {
      throw new UnprocessableEntityException(ERR.OVERRIDE_OUTCOME_INVALID);
    }

    const doc = await this.decisionModel
      .findOne({ applicationId, organizationId })
      .exec();

    if (!doc) {
      throw new NotFoundException(ERR.DECISION_NOT_FOUND);
    }

    const now = new Date();
    const previousOutcome = doc.outcome;

    doc.overrides.push({
      overriddenBy: actorId,
      overriddenAt: now,
      overriddenOutcome: previousOutcome,
      newOutcome: dto.newOutcome,
      justification: dto.justification,
    });

    doc.outcome = CommitteeOutcome.OVERRIDE;
    doc.resolvedAt = doc.resolvedAt ?? now;
    doc.resolvedBy = doc.resolvedBy ?? actorId;

    doc.auditTrail.push({
      action: 'outcome_overridden',
      actorId,
      actorDisplayName: actorDisplayName ?? actorId,
      occurredAt: now,
      payload: {
        previousOutcome,
        newOutcome: dto.newOutcome,
        justification: dto.justification,
      },
    });

    await doc.save();
    return toResult(doc);
  }

  // ── Read operations ───────────────────────────────────────────────────────

  /**
   * Fetches the committee decision for a single application.
   *
   * Throws:
   *   - 404 RES_COMMITTEE_DECISION_NOT_FOUND
   */
  async getDecision(
    organizationId: string,
    applicationId: string,
  ): Promise<CommitteeDecisionResult> {
    const doc = await this.decisionModel
      .findOne({ applicationId, organizationId })
      .exec();

    if (!doc) {
      throw new NotFoundException(ERR.DECISION_NOT_FOUND);
    }

    return toResult(doc);
  }

  /**
   * Returns all committee decisions for a program, with optional outcome filter.
   *
   * Only decisions with at least one vote are guaranteed to appear; decisions
   * opened but with no votes yet will also be included (they have
   * outcome = PENDING).
   */
  async listDecisions(
    programId: string,
    query: ListDecisionsQueryDto,
  ): Promise<CommitteeDecisionResult[]> {
    const filter: Record<string, unknown> = {
      organizationId: query.organizationId,
      programId: new Types.ObjectId(programId),
    };

    if (query.outcome !== undefined) {
      filter['outcome'] = query.outcome;
    }

    const docs = await this.decisionModel.find(filter).sort({ createdAt: 1 }).exec();
    return docs.map(toResult);
  }

  /**
   * Returns the full audit trail for a decision document.
   *
   * The audit trail is OWNER / ADMIN restricted at the controller layer.
   *
   * Throws:
   *   - 404 RES_COMMITTEE_DECISION_NOT_FOUND
   */
  async getAuditTrail(
    organizationId: string,
    applicationId: string,
  ): Promise<{ decisionId: string; auditTrail: CommitteeDecisionDocument['auditTrail'] }> {
    const doc = await this.decisionModel
      .findOne({ applicationId, organizationId })
      .exec();

    if (!doc) {
      throw new NotFoundException(ERR.DECISION_NOT_FOUND);
    }

    return {
      decisionId: String(doc._id),
      auditTrail: doc.auditTrail,
    };
  }
}
