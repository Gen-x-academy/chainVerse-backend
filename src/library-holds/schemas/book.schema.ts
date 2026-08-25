import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LendableType } from '../enums/lendable-type.enum';

export type BookDocument = HydratedDocument<Book>;

@Schema({ timestamps: true })
export class Book {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  author: string;

  @Prop({ trim: true })
  isbn?: string;

  @Prop({ required: true, enum: LendableType })
  type: LendableType;

  @Prop({ required: true, min: 0 })
  totalCopies: number;

  @Prop({ required: true, default: 3, min: 1 })
  maxActiveHoldsPerUser: number;

  @Prop({ required: true, default: 3, min: 1 })
  pickupWindowDays: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const BookSchema = SchemaFactory.createForClass(Book);

BookSchema.index({ title: 1 });
