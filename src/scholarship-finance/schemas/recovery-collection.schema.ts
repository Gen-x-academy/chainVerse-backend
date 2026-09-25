import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CollectionMethod } from '../domain/finance.enums';

export type RecoveryCollectionDocument = HydratedDocument<RecoveryCollection>;

/** A single amount received against a recovery claim. Append-only. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_recovery_collections',
})
export class RecoveryCollection {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  claimId: string;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ required: true, enum: Object.values(CollectionMethod) })
  method: CollectionMethod;

  /** Rail reference proving receipt (tx hash, bank ref). Unique per tenant. */
  @Prop({ required: true })
  externalReference: string;

  /** Required for award offsets: reference to the recipient's recorded consent. */
  @Prop({ type: String, default: null })
  recipientConsentRef: string | null;

  @Prop({ required: true })
  receivedAt: Date;

  @Prop({ required: true })
  recordedBy: string;

  @Prop({ required: true })
  journalId: string;
}

export const RecoveryCollectionSchema =
  SchemaFactory.createForClass(RecoveryCollection);
RecoveryCollectionSchema.index(
  { organizationId: 1, externalReference: 1 },
  { unique: true },
);
RecoveryCollectionSchema.index({ organizationId: 1, claimId: 1 });
