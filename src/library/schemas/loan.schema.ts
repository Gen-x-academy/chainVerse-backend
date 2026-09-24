import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LoanDocument = HydratedDocument<Loan>;

export enum LoanState {
  ACTIVE = 'active',
  RENEWED = 'renewed',
  RETURNED = 'returned',
  LOST = 'lost',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Loan {
  @Prop({ required: true })
  patronId: string;

  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true, enum: LoanState, default: LoanState.ACTIVE })
  state: LoanState;

  @Prop({ required: true })
  dueDate: Date;

  @Prop()
  returnedAt?: Date;

  @Prop({ required: true })
  actorId: string;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
