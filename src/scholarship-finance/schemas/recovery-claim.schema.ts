import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RecoveryReason, RecoveryStatus } from '../domain/finance.enums';

@Schema({ _id: false })
export class LegalBasis {
  /** Identifier of the governing policy / agreement version, e.g. `scholarship-terms-v3`. */
  @Prop({ required: true })
  policyReference: string;

  /** Specific clause that authorizes recovery, e.g. `§7.2`. */
  @Prop({ required: true })
  clause: string;

  @Prop({ required: true })
  description: string;
}

export const LegalBasisSchema = SchemaFactory.createForClass(LegalBasis);

export type RecoveryClaimDocument = HydratedDocument<RecoveryClaim>;

@Schema({ timestamps: true, collection: 'scholarship_recovery_claims' })
export class RecoveryClaim {
  @Prop({ required: true })
  organizationId: string;

  /** Opaque recipient (student) id. */
  @Prop({ required: true })
  recipientId: string;

  /** Fund that recovered money is returned to; null = unrestricted pool. */
  @Prop({ type: String, default: null })
  programId: string | null;

  @Prop({ type: String, default: null })
  awardReference: string | null;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ required: true, enum: Object.values(RecoveryReason) })
  reason: RecoveryReason;

  @Prop({ type: LegalBasisSchema, required: true })
  legalBasis: LegalBasis;

  /** References (document ids / URIs) to evidence; documents themselves are not stored here. */
  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ required: true, min: 1 })
  claimedMinor: number;

  @Prop({ required: true, default: 0 })
  collectedMinor: number;

  @Prop({ required: true, default: 0 })
  writtenOffMinor: number;

  @Prop({
    required: true,
    enum: Object.values(RecoveryStatus),
    default: RecoveryStatus.DRAFT,
  })
  status: RecoveryStatus;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: String, default: null })
  approvedBy: string | null;

  /** Set when the claim is approved and the recipient notice is dispatched. */
  @Prop({ type: Date, default: null })
  noticeIssuedAt: Date | null;

  @Prop({ type: String, default: null })
  openingJournalId: string | null;

  @Prop({ type: String, default: null })
  resolutionReason: string | null;
}

export const RecoveryClaimSchema = SchemaFactory.createForClass(RecoveryClaim);
RecoveryClaimSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
RecoveryClaimSchema.index({ organizationId: 1, recipientId: 1 });
