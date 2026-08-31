import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BookDocument = HydratedDocument<Book>;

export enum BookFormat {
  PHYSICAL = 'physical',
  EBOOK = 'ebook',
  AUDIOBOOK = 'audiobook',
}

/**
 * Accessibility attributes describing an alternate-format edition
 * (Issue #999).
 *
 * These are publication metadata only — they describe the format's
 * accessibility features, never a borrower's disability or accommodation
 * status. They can be searched and surfaced without exposing personal
 * health information.
 */
@Schema({ _id: false })
export class AlternateFormatMetadata {
  @Prop({ default: false })
  largePrint: boolean;

  @Prop({ default: false })
  dyslexiaFriendly: boolean;

  @Prop({ default: false })
  screenReaderReady: boolean;

  @Prop({ default: false })
  captioned: boolean;

  @Prop({ default: false })
  transcript: boolean;

  @Prop({ default: false })
  audiobook: boolean;

  @Prop({ trim: true, default: '' })
  language: string;
}

export const AlternateFormatMetadataSchema =
  SchemaFactory.createForClass(AlternateFormatMetadata);

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

  @Prop({ type: AlternateFormatMetadataSchema, default: () => ({}) })
  accessibility: AlternateFormatMetadata;

  /**
   * Cover image blob (Issue #998). Stored as validated raw bytes with a
   * stable content-addressable URL. Replacing it overwrites the buffer and
   * clears the previous stable URL so stale assets are cleaned up.
   */
  @Prop({ trim: true, default: '' })
  coverImageUrl: string;

  @Prop({ type: Buffer })
  coverImageData?: Buffer;

  @Prop({ trim: true, default: '' })
  coverImageMime?: string;

  @Prop({ trim: true, default: '' })
  topic: string;

  @Prop({ trim: true, default: '' })
  language: string;

  @Prop({ type: Types.ObjectId, ref: 'Series', index: true })
  seriesId?: Types.ObjectId;

  @Prop({ min: 0 })
  volumeNumber?: number;

  @Prop({ trim: true, default: '' })
  volumeLabel?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BookSchema = SchemaFactory.createForClass(Book);
BookSchema.index({ workKey: 1 });
