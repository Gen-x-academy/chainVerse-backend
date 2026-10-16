import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ScholarshipAssetStatus,
  ScholarshipAssetType,
  StellarNetwork,
} from '../domain/scholarship-asset.rules';

export type ScholarshipAssetDocument = HydratedDocument<ScholarshipAsset>;

/** An approved (or proposed) payout asset for one program in one organization. */
@Schema({ timestamps: true, collection: 'scholarship_assets' })
export class ScholarshipAsset {
  @Prop({ required: true, index: true })
  organizationId: string;

  /** Scholarship program the asset is approved for (opaque, tenant-scoped). */
  @Prop({ required: true })
  programId: string;

  @Prop({ type: String, required: true, enum: Object.values(StellarNetwork) })
  network: StellarNetwork;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ScholarshipAssetType),
  })
  assetType: ScholarshipAssetType;

  @Prop({ required: true })
  code: string;

  @Prop({ type: String, default: null })
  issuer: string | null;

  /** Maximum fractional digits a payment in this asset may carry (0-7). */
  @Prop({ required: true, min: 0, max: 7 })
  decimals: number;

  /** Overrides the platform confirmation depth for this asset when set. */
  @Prop({ type: Number, default: null, min: 1, max: 100 })
  requiredConfirmations: number | null;

  @Prop({
    type: String,
    enum: Object.values(ScholarshipAssetStatus),
    default: ScholarshipAssetStatus.PROPOSED,
  })
  status: ScholarshipAssetStatus;

  @Prop({ required: true })
  proposedBy: string;

  @Prop({ type: String, default: null })
  approvedBy: string | null;

  @Prop({ type: Date, default: null })
  approvedAt: Date | null;

  @Prop({ type: String, default: null })
  disabledBy: string | null;

  @Prop({ type: Date, default: null })
  disabledAt: Date | null;

  @Prop({ type: String, default: null })
  disabledReason: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipAssetSchema =
  SchemaFactory.createForClass(ScholarshipAsset);

// At most one live (proposed or active) configuration per asset per program.
ScholarshipAssetSchema.index(
  { organizationId: 1, programId: 1, network: 1, code: 1, issuer: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [ScholarshipAssetStatus.PROPOSED, ScholarshipAssetStatus.ACTIVE],
      },
    },
  },
);
