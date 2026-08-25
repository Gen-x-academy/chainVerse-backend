import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LoanState } from './loan.schema';

export type LoanHistoryDocument = HydratedDocument<LoanHistory>;

export enum LoanTransition {
  CHECKOUT = 'checkout',
  RENEWAL = 'renewal',
  DUE_DATE_ADJUSTED = 'due_date_adjusted',
  RETURN = 'return',
  LOSS = 'loss',
  CANCELLATION = 'cancellation',
}

@Schema({ timestamps: true })
export class LoanHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Loan', index: true })
  loanId: Types.ObjectId;

  @Prop({ required: true, enum: LoanTransition })
  transition: LoanTransition;

  @Prop({ required: true, enum: LoanState })
  fromState: LoanState;

  @Prop({ required: true, enum: LoanState })
  toState: LoanState;

  @Prop({ required: true })
  actorId: string;

  @Prop()
  source?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Date })
  effectiveAt: Date;
}

export const LoanHistorySchema = SchemaFactory.createForClass(LoanHistory);

// Immutability: block any update or delete on history records
LoanHistorySchema.pre(['updateOne', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete'] as any, function () {
  throw new Error('LoanHistory records are immutable');
});
