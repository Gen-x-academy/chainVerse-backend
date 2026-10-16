import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type CirculationReceiptDocument = HydratedDocument<CirculationReceipt>;

export enum ReceiptType {
  CHECKOUT = 'checkout',
  RETURN = 'return',
}

/**
 * A durable, immutable receipt for a checkout or return. Receipts are never
 * updated after creation — corrections happen via new circulation records,
 * never by editing history.
 */
@Schema({ timestamps: true })
export class CirculationReceipt {
  /** Public, opaque transaction id — never the Mongo _id. */
  @Prop({ required: true, unique: true, index: true })
  transactionId: string;

  @Prop({ enum: ReceiptType, required: true })
  type: ReceiptType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Loan', required: true, index: true })
  loanId: string;

  /** Owner of the receipt — the patron the loan belongs to. */
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true })
  itemTitle: string;

  @Prop({ required: true })
  itemAuthor: string;

  @Prop({ type: Date, default: null })
  dueAt?: Date | null;

  @Prop({ type: Date, default: null })
  returnedAt?: Date | null;

  @Prop({ required: true })
  policy: string;

  @Prop({ required: true })
  servicePoint: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CirculationReceiptSchema = SchemaFactory.createForClass(CirculationReceipt);
