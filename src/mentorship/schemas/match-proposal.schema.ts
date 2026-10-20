import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  InitiatorKind,
  ParticipantRole,
  ProposalStatus,
  SoftCheck,
} from '../mentorship.constants';
import { MatchTerms, MatchTermsSchema } from './match-terms.schema';

export type MatchProposalDocument = HydratedDocument<MatchProposal>;

@Schema({ _id: false })
export class CompatibilityReason {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  detail!: string;
}

@Schema({ _id: false })
export class ProposalInitiator {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  platformRole!: string;

  @Prop({ required: true, enum: Object.values(InitiatorKind) })
  kind!: InitiatorKind;
}

@Schema({ _id: false })
export class ProposalApproval {
  @Prop({ required: true, enum: Object.values(ParticipantRole) })
  participantRole!: ParticipantRole;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  termsVersion!: number;

  @Prop({ required: true })
  termsHash!: string;

  @Prop({ required: true, type: Date })
  approvedAt!: Date;
}

/** Coordinator involvement; `internalNote` is never shown to participants. */
@Schema({ _id: false })
export class CoordinatorRecord {
  @Prop({ required: true })
  coordinatorId!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: String, default: null })
  internalNote!: string | null;
}

@Schema({ _id: false })
export class ProposalOverride {
  @Prop({ required: true, enum: Object.values(SoftCheck) })
  check!: SoftCheck;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true })
  coordinatorId!: string;

  @Prop({ required: true, type: Date })
  appliedAt!: Date;
}

/** Append-only reason record for every state change. */
@Schema({ _id: false })
export class ProposalHistoryEntry {
  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  actorId!: string;

  @Prop({ type: String, default: null })
  actorRole!: string | null;

  @Prop({ type: String, default: null })
  reason!: string | null;

  /** Terms version the action applied to; null for closures. */
  @Prop({ type: Number, default: null })
  termsVersion!: number | null;

  @Prop({ required: true, type: Date })
  at!: Date;
}

@Schema({ timestamps: true, collection: 'mentorship_match_proposals' })
export class MatchProposal {
  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ required: true, index: true })
  programId!: string;

  @Prop({ type: [CompatibilityReason], default: [] })
  compatibilityReasons!: CompatibilityReason[];

  @Prop({ type: MatchTermsSchema, required: true })
  terms!: MatchTerms;

  @Prop({ required: true, default: 1 })
  termsVersion!: number;

  @Prop({ required: true })
  termsHash!: string;

  @Prop({ required: true, type: Date, index: true })
  expiresAt!: Date;

  @Prop({ type: ProposalInitiator, required: true })
  initiator!: ProposalInitiator;

  /** Optional message from the initiator, visible to both participants. */
  @Prop({ type: String, default: null })
  initiatorNote!: string | null;

  @Prop({
    required: true,
    enum: Object.values(ProposalStatus),
    default: ProposalStatus.PENDING,
    index: true,
  })
  status!: ProposalStatus;

  /** Snapshot of required approvals at creation so config changes don't strand proposals. */
  @Prop({
    type: [String],
    enum: Object.values(ParticipantRole),
    required: true,
  })
  requiredApprovals!: ParticipantRole[];

  @Prop({ type: [ProposalApproval], default: [] })
  approvals!: ProposalApproval[];

  @Prop({ default: false })
  capacityReserved!: boolean;

  @Prop({ type: CoordinatorRecord, default: null })
  coordinator!: CoordinatorRecord | null;

  @Prop({ type: [ProposalOverride], default: [] })
  overrides!: ProposalOverride[];

  @Prop({ type: String, default: null })
  supersedesProposalId!: string | null;

  @Prop({ type: String, default: null })
  supersededByProposalId!: string | null;

  @Prop({ type: String, default: null })
  engagementId!: string | null;

  @Prop({ type: Date, default: null })
  activationStartedAt!: Date | null;

  @Prop({ type: String, default: null })
  closedBy!: string | null;

  @Prop({ type: String, default: null })
  closedReason!: string | null;

  @Prop({ type: Date, default: null })
  closedAt!: Date | null;

  @Prop({ type: [ProposalHistoryEntry], default: [] })
  history!: ProposalHistoryEntry[];

  /**
   * `mentor:mentee:program` while the proposal is open, unset once closed.
   * The partial unique index makes "one open proposal per pair+program" an
   * atomic database guarantee rather than a read-then-write check.
   */
  @Prop({ type: String })
  openKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MatchProposalSchema = SchemaFactory.createForClass(MatchProposal);

MatchProposalSchema.index(
  { openKey: 1 },
  { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } },
);
MatchProposalSchema.index({ status: 1, expiresAt: 1 });
MatchProposalSchema.index({ 'overrides.0': 1, createdAt: -1 });
MatchProposalSchema.index({ 'coordinator.coordinatorId': 1, createdAt: -1 });
