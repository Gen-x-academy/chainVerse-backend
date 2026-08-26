import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DigitalLoanDocument = HydratedDocument<DigitalLoan>;

export enum DigitalLoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'library_digital_loans' })
export class DigitalLoan {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Book', index: true })
  bookId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  editionId: string;

  @Prop({ required: true, trim: true })
  format: string;

  @Prop({ required: true, default: Date.now })
  checkedOutAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, enum: DigitalLoanStatus, default: DigitalLoanStatus.ACTIVE, index: true })
  status: DigitalLoanStatus;

  @Prop()
  returnedAt?: Date;

  @Prop({ default: false })
  accessRevoked: boolean;

  @Prop({ trim: true })
  accessToken?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DigitalLoanSchema = SchemaFactory.createForClass(DigitalLoan);
DigitalLoanSchema.index({ patronId: 1, status: 1 });
DigitalLoanSchema.index({ editionId: 1, status: 1 });
