import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VerifiedPaymentDocument = HydratedDocument<VerifiedPayment>;

@Schema({ timestamps: true, collection: 'verified_payments' })
export class VerifiedPayment {
  @Prop({ required: true, unique: true, index: true })
  transactionHash: string;

  @Prop({ required: true })
  verified: boolean;

  @Prop()
  ledgerSequence: number;

  @Prop()
  ledgerCloseTime: string;

  @Prop()
  sourceAccount: string;

  @Prop()
  destinationAccount: string;

  @Prop()
  amount: string;

  @Prop()
  assetCode: string;

  @Prop()
  assetIssuer: string;

  @Prop()
  memo: string;

  @Prop()
  courseId: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const VerifiedPaymentSchema =
  SchemaFactory.createForClass(VerifiedPayment);
