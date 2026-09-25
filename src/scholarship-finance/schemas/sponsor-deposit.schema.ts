import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  DepositRail,
  DepositStatus,
  FeeKind,
  RoundingMode,
} from '../domain/finance.enums';
import { Asset, AssetSchema } from './asset.schema';

@Schema({ _id: false })
export class DepositSource {
  @Prop({ required: true, enum: Object.values(DepositRail) })
  rail: DepositRail;

  /** Rail-specific unique reference: Stellar tx hash, bank reference, PSP charge id. */
  @Prop({ required: true, trim: true })
  reference: string;

  /** Originating account (e.g. Stellar G-address). Optional for fiat rails. */
  @Prop({ type: String, default: null })
  sourceAccount: string | null;
}

export const DepositSourceSchema = SchemaFactory.createForClass(DepositSource);

@Schema({ _id: false })
export class AppliedFee {
  @Prop({ type: String, default: null })
  feeScheduleId: string | null;

  @Prop({ type: Number, default: null })
  feeScheduleVersion: number | null;

  @Prop({ required: true, enum: Object.values(RoundingMode) })
  rounding: RoundingMode;

  @Prop({ required: true })
  platformFeeMinor: number;

  @Prop({ required: true })
  networkFeeMinor: number;

  @Prop({
    type: [
      {
        kind: { type: String, enum: Object.values(FeeKind) },
        basisPoints: Number,
        fixedMinor: Number,
        amountMinor: Number,
        _id: false,
      },
    ],
    default: [],
  })
  lines: {
    kind: FeeKind;
    basisPoints: number;
    fixedMinor: number;
    amountMinor: number;
  }[];
}

export const AppliedFeeSchema = SchemaFactory.createForClass(AppliedFee);

export type SponsorDepositDocument = HydratedDocument<SponsorDeposit>;

@Schema({ timestamps: true, collection: 'scholarship_sponsor_deposits' })
export class SponsorDeposit {
  @Prop({ required: true })
  organizationId: string;

  /** Opaque sponsor identifier (org member / external CRM id). No sponsor PII is stored here. */
  @Prop({ required: true })
  sponsorId: string;

  @Prop({ type: String, default: null })
  fundingRoundId: string | null;

  /** Original allocation at credit time; null = unrestricted pool. */
  @Prop({ type: String, default: null })
  programId: string | null;

  @Prop({ type: AssetSchema, required: true })
  asset: Asset;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ type: DepositSourceSchema, required: true })
  source: DepositSource;

  /** Amount that actually arrived. */
  @Prop({ required: true, min: 1 })
  grossMinor: number;

  /** Amount credited to the fund after fees; set on credit. */
  @Prop({ type: Number, default: null })
  netMinor: number | null;

  @Prop({ type: AppliedFeeSchema, default: null })
  fee: AppliedFee | null;

  /** Net amount already refunded; can never exceed netMinor. */
  @Prop({ required: true, default: 0 })
  refundedMinor: number;

  @Prop({
    required: true,
    enum: Object.values(DepositStatus),
    default: DepositStatus.PENDING,
  })
  status: DepositStatus;

  @Prop({ required: true })
  receivedAt: Date;

  @Prop({ type: String, default: null })
  creditJournalId: string | null;

  @Prop({ required: true })
  recordedBy: string;

  @Prop({ type: String, default: null })
  creditedBy: string | null;

  @Prop({ type: Date, default: null })
  creditedAt: Date | null;

  @Prop({ type: String, default: null })
  rejectionReason: string | null;
}

export const SponsorDepositSchema =
  SchemaFactory.createForClass(SponsorDeposit);
// A given on-chain / rail transfer can be recorded exactly once, platform-wide.
SponsorDepositSchema.index(
  { 'source.rail': 1, 'source.reference': 1, assetKey: 1 },
  { unique: true },
);
SponsorDepositSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
SponsorDepositSchema.index({ organizationId: 1, fundingRoundId: 1 });
