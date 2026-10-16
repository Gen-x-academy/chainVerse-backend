import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type LoanDocument = HydratedDocument<Loan>;

export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  LOST = 'lost',
}

/** A single circulation record: one item checked out to one patron. */
@Schema({ timestamps: true })
export class Loan {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'LibraryItem', required: true, index: true })
  itemId: string;

  /** The patron the item is checked out to (student user id). */
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ enum: LoanStatus, required: true, default: LoanStatus.ACTIVE, index: true })
  status: LoanStatus;

  @Prop({ required: true })
  checkedOutAt: Date;

  @Prop({ required: true })
  dueAt: Date;

  @Prop({ type: Date, default: null })
  returnedAt?: Date | null;

  @Prop({ default: 0, min: 0 })
  renewalCount: number;

  @Prop({ default: 2, min: 0 })
  maxRenewals: number;

  @Prop({ required: true, trim: true })
  servicePoint: string;

  /** Staff member who performed an assisted checkout, if any. */
  @Prop({ type: String, default: null })
  checkedOutByStaffId?: string | null;

  /** Staff member who performed an assisted return, if any. */
  @Prop({ type: String, default: null })
  returnedByStaffId?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);

LoanSchema.index({ patronId: 1, status: 1 });
