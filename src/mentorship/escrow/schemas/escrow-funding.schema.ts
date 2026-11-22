import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum EscrowFundingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  UNDERPAID = 'underpaid',
  OVERPAID = 'overpaid',
}

@Schema({ timestamps: true, collection: 'mentorship_escrow_fundings' })
export class EscrowFunding {
  @Prop({ required: true, index: true })
  agreementId!: string;

  @Prop({ required: true })
  expectedAmount!: number;

  @Prop({ required: true })
  currency!: string;

  @Prop({
    required: true,
    enum: EscrowFundingStatus,
    default: EscrowFundingStatus.PENDING,
  })
  status!: EscrowFundingStatus;

  @Prop({ type: Number, default: null })
  confirmedAmount!: number | null;

  @Prop({ type: String, default: null })
  providerRef!: string | null;

  @Prop({ required: true })
  idempotencyKey!: string;

  @Prop({ type: Date, default: null })
  confirmedAt!: Date | null;
}

export type EscrowFundingDocument = HydratedDocument<EscrowFunding>;
export const EscrowFundingSchema = SchemaFactory.createForClass(EscrowFunding);
EscrowFundingSchema.index(
  { agreementId: 1, idempotencyKey: 1 },
  { unique: true },
);
