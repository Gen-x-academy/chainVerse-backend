import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookDocument = HydratedDocument<Book>;

export enum BookStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  WITHDRAWN = 'withdrawn',
}

/**
 * Bibliographic Book schema - immutable identifiers (ISBN) are set on creation
 * and cannot be changed afterwards to preserve catalog integrity.
 *
 * For issue #976: create bibliographic Book schema with immutable identifiers.
 */
@Schema({ timestamps: true, collection: 'elibrary_books' })
export class Book {
  /** Human-readable title. */
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  subtitle?: string;

  @Prop({ trim: true })
  description?: string;

  /**
   * ISBN-13 is the canonical identifier. Stored without dashes, validated to
   * 13 digits. Immutable after first save.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    match: /^\d{13}$/,
  })
  isbn13: string;

  /** Optional ISBN-10 for legacy records. Stored without dashes. */
  @Prop({ match: /^\d{9}[\dX]$/ })
  isbn10?: string;

  @Prop({ required: true })
  authors: string[];

  @Prop({ trim: true })
  publisher?: string;

  @Prop()
  publicationDate?: Date;

  @Prop({ default: 'en', maxlength: 10 })
  language: string;

  @Prop({ trim: true })
  edition?: string;

  /** Library of Congress or user-defined subject headings. */
  @Prop({ index: true })
  subjects: string[];

  /** URL or storage path for the cover image. */
  @Prop()
  coverUrl?: string;

  @Prop({
    type: String,
    enum: BookStatus,
    default: BookStatus.ACTIVE,
    index: true,
  })
  status: BookStatus;
}

export const BookSchema = SchemaFactory.createForClass(Book);

// Compound index for common catalog queries
BookSchema.index({ title: 'text', subjects: 'text' });