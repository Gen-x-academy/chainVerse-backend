import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AllocationChangeDocument = HydratedDocument<AllocationChange>;

/** Record of an approved move of funds between programs / the pool. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_allocation_changes',
})
export class AllocationChange {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  assetKey: string;

  @Prop({ type: String, default: null })
  fromProgramId: string | null;

  @Prop({ type: String, default: null })
  toProgramId: string | null;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  /** Optional deposit the move relates to (e.g. sponsor asked to re-direct their gift). */
  @Prop({ type: String, default: null })
  depositId: string | null;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  approvedBy: string;

  @Prop({ required: true })
  journalId: string;
}

export const AllocationChangeSchema =
  SchemaFactory.createForClass(AllocationChange);
AllocationChangeSchema.index({ organizationId: 1, createdAt: -1 });
