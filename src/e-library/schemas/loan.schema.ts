import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LoanStatus } from '../enums/loan-status.enum';

export type LoanDocument = HydratedDocument<Loan>;

@Schema({ timestamps: true })
export class Loan {
  @Prop({ required: true })
  patronId: string;

  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true })
  borrowedAt: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ type: Date, default: null })
  returnedAt: Date | null;

  @Prop({ type: String, enum: LoanStatus, default: LoanStatus.ACTIVE })
  status: LoanStatus;

  // Last time the overdue scheduler evaluated this loan; used for observability.
  @Prop({ type: Date, default: null })
  lastOverdueCheckAt: Date | null;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ status: 1, dueDate: 1 });
LoanSchema.index({ patronId: 1 });
