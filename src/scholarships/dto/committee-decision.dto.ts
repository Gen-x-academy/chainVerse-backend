import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CommitteeOutcome,
  DecisionVoteType,
} from '../schemas/committee-decision.schema';

// ── Open a decision round ─────────────────────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/programs/:programId/applications/:applicationId/committee-decision`.
 *
 * Opens a new committee decision round for an application.  Only one decision
 * document may exist per application (the endpoint returns 409 if one already
 * exists).
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - Application must exist and be owned by the same organization.
 *   - `quorumRequired` must be ≥ 1.
 */
export class OpenDecisionRoundDto {
  @ApiProperty({
    description:
      'Minimum number of non-recused member votes required to resolve the ' +
      'outcome.  Must be ≥ 1.',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quorumRequired: number;
}

// ── Cast a vote ───────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST …/committee-decision/votes`.
 *
 * A committee member casts or amends their vote on an application.
 *
 * Authorization: OWNER, ADMIN, or INSTRUCTOR.
 *
 * Business rules enforced by the service:
 *   - Decision document must exist (BIZ_DECISION_NOT_FOUND).
 *   - A member may vote only once per application; a second call from the same
 *     member is treated as an amendment: the old vote is marked `superseded`
 *     and a new entry with `amendedFromVoteId` is appended.
 *   - RECUSE votes must not include `evidenceVersionId` or `rationale` that
 *     argues substance; service accepts both fields but treats the vote as a
 *     formal conflict declaration.
 *   - A member who has already RECUSED cannot amend to a substantive vote
 *     (BIZ_ALREADY_RECUSED).
 *   - The outcome is re-evaluated after every non-recusal vote once quorum
 *     is reached.
 */
export class CastVoteDto {
  @ApiProperty({
    enum: DecisionVoteType,
    description:
      'The vote cast by this committee member.  ' +
      'RECUSE declares a conflict of interest and excludes the member ' +
      'from quorum and tally calculations.',
    example: DecisionVoteType.SHORTLIST,
  })
  @IsEnum(DecisionVoteType)
  vote: DecisionVoteType;

  @ApiPropertyOptional({
    description:
      'Version identifier of the evidence snapshot this member reviewed ' +
      '(e.g. a ProgramTermsVersion ObjectId or a document hash).  ' +
      'Required for all non-RECUSE votes to link the vote to its inputs.',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  evidenceVersionId?: string;

  @ApiPropertyOptional({
    description:
      'Rationale for this vote.  For RECUSE votes, describe the conflict ' +
      'of interest.  For other votes, provide the reasoning.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;

  @ApiPropertyOptional({
    description:
      'Display name of the member casting the vote.  ' +
      'When omitted the service falls back to the JWT `sub` value.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memberDisplayName?: string;
}

// ── Override outcome ──────────────────────────────────────────────────────────

/**
 * Body DTO for `POST …/committee-decision/override`.
 *
 * Allows an OWNER to manually override the algorithmically-resolved outcome.
 * An override is permitted at any point — including before quorum is reached
 * and after a previous override.  Every override is recorded in the
 * `overrides` array so the full history is preserved.
 *
 * Authorization: OWNER only.
 *
 * Business rules enforced by the service:
 *   - Decision document must exist (BIZ_DECISION_NOT_FOUND).
 *   - `newOutcome` must not be PENDING (BIZ_OVERRIDE_OUTCOME_INVALID).
 *   - `justification` is mandatory (VAL_JUSTIFICATION_REQUIRED).
 */
export class OverrideDecisionDto {
  @ApiProperty({
    enum: CommitteeOutcome,
    description:
      'The outcome to force.  Must not be PENDING.  ' +
      'Valid values: shortlist, waitlist, awarded, rejected, tie.',
    example: CommitteeOutcome.AWARDED,
  })
  @IsEnum(CommitteeOutcome)
  newOutcome: CommitteeOutcome;

  @ApiProperty({
    description:
      'Mandatory justification explaining why the algorithmic outcome is ' +
      'being overridden.  Stored in the audit trail for compliance.',
    maxLength: 2000,
    example: 'Applicant meets exceptional criteria not captured by rubric.',
  })
  @IsString()
  @MaxLength(2000)
  justification: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Query parameters shared by all committee-decision endpoints that require
 * tenant scoping.
 */
export class DecisionScopeQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;
}

/**
 * Query parameters for the program-level decision list endpoint.
 *
 * `GET /scholarships/programs/:programId/committee-decisions`
 */
export class ListDecisionsQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: CommitteeOutcome,
    description: 'Filter by resolved outcome.  Omit to return all decisions.',
    example: CommitteeOutcome.AWARDED,
  })
  @IsOptional()
  @IsEnum(CommitteeOutcome)
  outcome?: CommitteeOutcome;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Summary of a single committee member's effective (non-superseded) vote,
 * returned as part of `CommitteeDecisionResult`.
 *
 * Member identity is included because this payload is staff-only.
 */
export interface CommitteeVoteSummary {
  voteId: string;
  memberId: string;
  memberDisplayName: string;
  memberRole: string;
  vote: DecisionVoteType;
  evidenceVersionId?: string;
  rationale?: string;
  votedAt: string;
  isAmendment: boolean;
}

/**
 * Full committee decision payload returned by the service to the controller.
 *
 * Privacy:
 *   - `votes` and `auditTrail` are staff-only data; never return to applicants.
 *   - Only `outcome` and `resolvedAt` are safe to expose to applicants.
 */
export interface CommitteeDecisionResult {
  decisionId: string;
  organizationId: string;
  applicationId: string;
  programId: string;
  quorumRequired: number;
  quorumReached: boolean;
  eligibleVoteCount: number; // non-recused, non-superseded votes
  outcome: CommitteeOutcome;
  resolvedAt: string | null;
  resolvedBy: string | null;
  votes: CommitteeVoteSummary[];
  overrideCount: number;
  createdAt: string;
  updatedAt: string;
}
