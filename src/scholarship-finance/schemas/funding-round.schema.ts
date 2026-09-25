import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { FundingRoundStatus } from '../domain/finance.enums';
import { Asset, AssetSchema } from './asset.schema';

export type FundingRoundDocument = HydratedDocument<FundingRound>;

/**
 * A time-boxed fundraising window. Deposits made against a round inherit
 * its asset and allocation (a specific program, or the unrestricted pool
 * when `programId` is null).
 */
@Schema({ timestamps: true, collection: 'scholarship_funding_rounds' })
export class FundingRound {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  programId: string | null;

  @Prop({ type: AssetSchema, required: true })
  asset: Asset;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ type: Number, default: null })
  targetMinor: number | null;

  @Prop({ required: true })
  opensAt: Date;

  @Prop({ required: true })
  closesAt: Date;

  @Prop({
    required: true,
    enum: Object.values(FundingRoundStatus),
    default: FundingRoundStatus.OPEN,
  })
  status: FundingRoundStatus;

  /** Sum of net amounts credited to the round's allocation. */
  @Prop({ required: true, default: 0 })
  raisedNetMinor: number;

  @Prop({ required: true })
  createdBy: string;
}

export const FundingRoundSchema = SchemaFactory.createForClass(FundingRound);
FundingRoundSchema.index({ organizationId: 1, status: 1, closesAt: 1 });
