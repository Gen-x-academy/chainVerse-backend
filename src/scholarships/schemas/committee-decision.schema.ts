import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommitteeDecisionDocument = HydratedDocument<CommitteeDecision>;

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * The committee action a member casts on a single scholarship application.
 *
 * SHORTLIST  – application advances for further consideration / final round.
 * WAITLIST   – application is held in reserve; may be promoted if a slot opens.
 * AWARD      – the application is approved and the award is granted.
 * REJECT     – the application is definitively declined.
 * RECUSE     – the member formally declares a conflict of interest and
 *              removes themselves from voting on this application.
 *              Recused votes are excluded from quorum and tally calculations.
 */
export enum DecisionVoteType {
  SHORTLIST = 'shortlist',
  WAITLIST = 'waitlist',
  AWARD = 'award',
  REJECT = 'reject',
  RECUSE = 'recuse',
}

/**
 * The authoritative outcome resolved for an application after the committee
 * reaches quorum.
 *
 * PENDING   – quorum has not yet been reached; outcome undetermined.
 * SHORTLIST – majority of eligible (non-recused) votes are SHORTLIST.
 * WAITLIST  – majority of eligible votes are WAITLIST.
 * AWARDED   – majority of eligible votes are AWARD.
 * REJECTED  – majority of eligible votes are REJECT.
 * TIE       – no single vote type holds a majority; escalation required.
 * OVERRIDE  – an OWNER has applied a manual override after quorum.
 */
export enum CommitteeOutcome {
  PENDING = 'pending',
  SHORTLIST = 'shortlist',
  WAITLIST = 'waitlist',
  AWARDED = 'awarded',
  REJECTED = 'rejected',
  TIE = 'tie',
  OVERRIDE = 'override',
}

// ── Sub-documents ─────────────────────────────────────────────────────────────

/**
 * A single committee member's vote on an application.
 *
 * Immutability:
 *   Once a vote is recorded it is never mutated in-place; changes to an
 *   existing vote create a new entry in the `votes` array with an
 *   `amendedFromVoteId` reference pointing to the superseded vote.  This
 *   preserves a full audit trail even when members correct earlier votes.
 *
 * Privacy:
 *   Individual member votes are internal committee data.  Must not be
 *   returned to applicants.  Expose only the resolved `outcome` publicly.
 *
 * Evidence versioning:
 *   `evidenceVersionId` links the vote to the specific snapshot of application
 *   evidence the member was reviewing at vote time (e.g. a ProgramTermsVersion
 *   or a document-hash snapshot).  This makes each vote reproducibly traceable
 *   to the inputs the member saw.
 */
@Schema({ _id: true, timestamps: true })
export class CommitteeVote {
  /** Auto-generated ObjectId used for amendment linking. */
  _id: Types.ObjectId;

  /** JWT `sub` of the committee member casting this vote. */
  @Prop({ required: true })
  memberId: string;

  /** Display name of the member at vote time (denormalized for audit readability). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  memberDisplayName: string;

  /** Role of the member in the organization at vote time. */
  @Prop({ required: true, trim: true, maxlength: 100 })
  memberRole: string;

  @Prop({
    required: true,
    enum: DecisionVoteType,
  })
  vote: DecisionVoteType;

  /**
   * Version identifier of the evidence the member reviewed before voting.
   * Typically a ProgramTermsVersion ObjectId or a SHA-256 document hash.
   * Stored as a string to be agnostic to the upstream evidence model.
   *
   * Required for every non-recusal vote so each vote is permanently tied to
   * the exact evidence snapshot that informed it.
   */
  @Prop({ trim: true })
  evidenceVersionId?: string;

  /**
   * Optional free-text rationale for this vote.
   * For RECUSE votes this should describe the conflict of interest.
   */
  @Prop({ trim: true, maxlength: 2000 })
  rationale?: string;

  /**
   * When set, this vote amends / supersedes the vote with the given id.
   * The original vote is retained unchanged; this entry represents the
   * corrected position.  Only the latest amendment for a memberId
   * participates in tally and quorum calculations.
   */
  @Prop({ type: Types.ObjectId, default: null })
  amendedFromVoteId: Types.ObjectId | null;

  /** Set to true when this vote has been superseded by a later amendment. */
  @Prop({ default: false })
  superseded: boolean;

  /** Server-set timestamp when this vote was recorded. */
  @Prop({ required: true })
  votedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommitteeVoteSchema = SchemaFactory.createForClass(CommitteeVote);

/**
 * Records when the committee outcome was manually overridden by an OWNER.
 *
 * An override does not erase the vote history; it appends an authoritative
 * decision on top of the tally.  The `overriddenOutcome` captures what the
 * algorithm had resolved before the override so the change is fully auditable.
 */
@Schema({ _id: false })
export class DecisionOverrideRecord {
  /** JWT `sub` of the OWNER who applied the override. */
  @Prop({ required: true })
  overriddenBy: string;

  @Prop({ required: true })
  overriddenAt: Date;

  /** The algorithmically-resolved outcome that was replaced. */
  @Prop({ required: true, enum: CommitteeOutcome })
  overriddenOutcome: CommitteeOutcome;

  /** The manually set new outcome. */
  @Prop({ required: true, enum: CommitteeOutcome })
  newOutcome: CommitteeOutcome;

  /** Required justification for every override (compliance / audit). */
  @Prop({ required: true, trim: true, maxlength: 2000 })
  justification: string;
}

export const DecisionOverrideRecordSchema = SchemaFactory.createForClass(
  DecisionOverrideRecord,
);

/**
 * One entry in the append-only audit log attached to every committee decision
 * document.  Every state-mutating action appends an entry here; entries are
 * never deleted or overwritten.
 *
 * Operational impact:
 *   The array grows with every vote / override / status change.  For high-
 *   volume programs consider periodically archiving old entries to a separate
 *   audit collection.
 */
@Schema({ _id: false })
export class DecisionAuditEntry {
  /** Machine-readable action identifier (e.g. "vote_cast", "outcome_resolved", "override"). */
  @Prop({ required: true, trim: true, maxlength: 100 })
  action: string;

  /** JWT `sub` of the actor who triggered the action. */
  @Prop({ required: true })
  actorId: string;

  /** Display name of the actor at action time (denormalized for readability). */
  @Prop({ trim: true, maxlength: 200 })
  actorDisplayName?: string;

  /** Server timestamp of this action. */
  @Prop({ required: true })
  occurredAt: Date;

  /** Arbitrary structured payload capturing action-specific details. */
  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;
}

export const DecisionAuditEntrySchema =
  SchemaFactory.createForClass(DecisionAuditEntry);

// ── Root document ─────────────────────────────────────────────────────────────

/**
 * One committee decision process for a single scholarship application.
 *
 * Lifecycle:
 *   1. Document is created (outcome = PENDING) when the first vote is cast or
 *      when a program admin opens the decision round for an application.
 *   2. Committee members cast votes.  Each RECUSE vote is excluded from quorum.
 *   3. When the number of non-recused votes ≥ `quorumRequired`, the service
 *      resolves the outcome by simple majority among non-recused votes.
 *      Ties (no majority) set outcome = TIE.
 *   4. An OWNER may apply an override at any point (including post-quorum),
 *      appending a DecisionOverrideRecord and setting outcome = OVERRIDE.
 *   5. Every mutation appends to `auditTrail`.
 *
 * Quorum rules:
 *   - `quorumRequired` is set per-application when the decision document is
 *     created (copied from the program configuration or supplied by the admin).
 *   - Recused members do not count toward quorum.
 *   - Quorum is re-evaluated after every non-recusal vote.
 *
 * Tenant isolation:
 *   All queries must filter by `organizationId`.
 *
 * Migration:
 *   New collection `scholarship_committee_decisions`.
 *   No existing data is affected.
 *   The compound unique index `{ applicationId }` ensures one decision
 *   process per application.
 *
 * Privacy:
 *   - Individual votes are staff-only.  Only `outcome` and `resolvedAt` may
 *     be surfaced to applicants.
 *   - `auditTrail` is restricted to OWNER / ADMIN access.
 */
@Schema({
  timestamps: true,
  collection: 'scholarship_committee_decisions',
})
export class CommitteeDecision {
  /** Tenant scope — matches the owning application's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /** The scholarship application this decision governs. */
  @Prop({
    required: true,
    unique: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /** Denormalized program reference for efficient program-level queries. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  /**
   * Minimum number of non-recused votes required before the outcome is
   * resolved.  Set when the decision document is created.  Must be ≥ 1.
   *
   * Example: a 5-member committee with quorumRequired = 3 resolves as soon
   * as 3 non-recused members have voted, regardless of the other 2.
   */
  @Prop({ required: true, min: 1 })
  quorumRequired: number;

  /**
   * Authoritative current outcome of the committee process.
   * Starts as PENDING.  Transitions to a terminal state once quorum is
   * reached or an override is applied.
   */
  @Prop({
    required: true,
    enum: CommitteeOutcome,
    default: CommitteeOutcome.PENDING,
    index: true,
  })
  outcome: CommitteeOutcome;

  /**
   * Server timestamp when the outcome was first resolved (quorum reached or
   * first override).  Null while still PENDING.
   */
  @Prop({ default: null })
  resolvedAt: Date | null;

  /**
   * JWT `sub` of the member whose vote triggered quorum resolution.
   * Null while PENDING or when outcome was set by override only.
   */
  @Prop({ default: null })
  resolvedBy: string | null;

  /**
   * All votes cast by committee members, including amendments and superseded
   * entries.  The full history is retained for audit purposes.
   *
   * For tally / quorum purposes the service considers only votes where
   * `superseded = false`.
   */
  @Prop({ type: [CommitteeVoteSchema], default: [] })
  votes: CommitteeVote[];

  /**
   * Records of every manual override applied to this decision, in chronological
   * order.  The last entry is the currently active override.
   */
  @Prop({ type: [DecisionOverrideRecordSchema], default: [] })
  overrides: DecisionOverrideRecord[];

  /**
   * Append-only audit log.  Every vote, amendment, override, and status
   * change is appended here.  Entries are never removed.
   */
  @Prop({ type: [DecisionAuditEntrySchema], default: [] })
  auditTrail: DecisionAuditEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommitteeDecisionSchema =
  SchemaFactory.createForClass(CommitteeDecision);

// ── Compound indexes ──────────────────────────────────────────────────────────

/** Program-level outcome queries (e.g. list all awarded applications). */
CommitteeDecisionSchema.index({ organizationId: 1, programId: 1, outcome: 1 });
/** Efficient member-vote lookups (e.g. "has this member already voted?"). */
CommitteeDecisionSchema.index({ applicationId: 1, 'votes.memberId': 1 });
