import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { WaiverStatus } from '../enums/waiver-status.enum';

export type WaiverRequestDocument = HydratedDocument<WaiverRequest>;

@Schema({ timestamps: true })
export class WaiverRequest {
  @Prop({ required: true })
  patronId: string;

  // The original charge LedgerEntry this waiver/adjustment corrects.
  @Prop({ required: true })
  chargeEntryId: string;

  @Prop({ required: true, type: String, enum: LedgerEntryType })
  entryType: LedgerEntryType;

  // Magnitude requested, in minor currency units (always >= 0 as stored;
  // sign is applied when the compensating ledger entry is posted).
  @Prop({ required: true })
  amountMinorUnits: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  requestedBy: string;

  @Prop({ required: true })
  requestedByRole: string;

  // The auto-approval threshold in effect at request time, for audit purposes.
  @Prop({ required: true })
  thresholdMinorUnitsAtRequest: number;

  @Prop({
    type: String,
    enum: WaiverStatus,
    default: WaiverStatus.PENDING_APPROVAL,
  })
  status: WaiverStatus;

  @Prop({ type: String, default: null })
  decidedBy: string | null;

  @Prop({ type: Date, default: null })
  decidedAt: Date | null;

  @Prop({ type: String, default: null })
  decisionNotes: string | null;

  @Prop({ type: String, default: null })
  resultingLedgerEntryId: string | null;

  @Prop({ type: Number, default: null })
  balanceBeforeMinorUnits: number | null;

  @Prop({ type: Number, default: null })
  balanceAfterMinorUnits: number | null;
}

export const WaiverRequestSchema = SchemaFactory.createForClass(WaiverRequest);
WaiverRequestSchema.index({ patronId: 1, status: 1 });
WaiverRequestSchema.index({ chargeEntryId: 1 });
