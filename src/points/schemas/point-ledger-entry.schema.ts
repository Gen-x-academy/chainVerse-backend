import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PointLedgerEntryDocument = HydratedDocument<PointLedgerEntry>;

export enum LedgerEntryEventType {
  AWARD = 'award',
  DEDUCTION = 'deduction',
}

@Schema({ timestamps: true, collection: 'point_ledger_entries' })
export class PointLedgerEntry {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, enum: LedgerEntryEventType })
  eventType: LedgerEntryEventType;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ type: String, default: null })
  referenceId?: string | null;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const PointLedgerEntrySchema =
  SchemaFactory.createForClass(PointLedgerEntry);

PointLedgerEntrySchema.index({ userId: 1, createdAt: 1 });
