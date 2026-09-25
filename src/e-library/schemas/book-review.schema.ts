import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookReviewDocument = HydratedDocument<BookReview>;

export enum ReviewStatus {
  PUBLISHED = 'published',
  FLAGGED = 'flagged',
  REMOVED = 'removed',
}

@Schema({ timestamps: true, collection: 'library_book_reviews' })
export class BookReview {
  @Prop({ required: true, index: true })
  bookId: string;

  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', maxlength: 10000 })
  content: string;

  @Prop({ required: true, enum: ReviewStatus, default: ReviewStatus.PUBLISHED })
  status: ReviewStatus;

  @Prop({ default: 0, min: 0 })
  reportCount: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BookReviewSchema = SchemaFactory.createForClass(BookReview);
BookReviewSchema.index({ bookId: 1, patronId: 1 }, { unique: true });
BookReviewSchema.index({ bookId: 1, status: 1 });
BookReviewSchema.index({ status: 1, reportCount: -1 });
