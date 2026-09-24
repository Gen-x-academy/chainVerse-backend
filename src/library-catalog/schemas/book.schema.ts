import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookDocument = HydratedDocument<Book>;

export enum BookStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Schema({ timestamps: true })
export class Book {
  @Prop({ required: true, unique: true, index: true })
  isbn: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: [String], default: [] })
  authors: string[];

  @Prop()
  publisher?: string;

  @Prop()
  publishedYear?: number;

  @Prop()
  description?: string;

  @Prop()
  coverImageUrl?: string;

  @Prop({ default: BookStatus.DRAFT, enum: BookStatus })
  status: BookStatus;

  /** Incremented on every save; used for optimistic concurrency on updates. */
  @Prop({ default: 0 })
  revision: number;
}

export const BookSchema = SchemaFactory.createForClass(Book);