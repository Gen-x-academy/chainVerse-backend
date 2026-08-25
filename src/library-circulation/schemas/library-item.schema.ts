import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LibraryItemDocument = HydratedDocument<LibraryItem>;

/** A circulating library item (e.g. one title, with one or more copies). */
@Schema({ timestamps: true })
export class LibraryItem {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  author: string;

  @Prop({ required: true, unique: true, index: true, trim: true })
  barcode: string;

  @Prop({ required: true, min: 1 })
  totalCopies: number;

  @Prop({ required: true, min: 0 })
  availableCopies: number;

  @Prop({ required: true, trim: true, default: 'main' })
  servicePoint: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LibraryItemSchema = SchemaFactory.createForClass(LibraryItem);
