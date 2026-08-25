import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookDocument = HydratedDocument<Book>;

export enum BookFormat {
  PHYSICAL = 'physical',
  EBOOK = 'ebook',
  AUDIOBOOK = 'audiobook',
}

/**
 * A single edition/format of a work (e.g. the hardcover vs. the ebook of the
 * same title). `workKey` groups editions of the same underlying work so
 * duplicate-edition hold rules can be enforced across them.
 */
@Schema({ timestamps: true, collection: 'library_books' })
export class Book {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  author: string;

  @Prop({ required: true, index: true })
  workKey: string;

  @Prop({ required: true, enum: BookFormat })
  format: BookFormat;

  @Prop({ required: true, min: 0 })
  totalCopies: number;

  @Prop({ required: true, min: 0 })
  availableCopies: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BookSchema = SchemaFactory.createForClass(Book);
BookSchema.index({ workKey: 1 });
