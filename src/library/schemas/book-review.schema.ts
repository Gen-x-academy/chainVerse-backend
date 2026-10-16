import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BookReviewDocument = HydratedDocument<BookReview>;
export type ContentReportDocument = HydratedDocument<ContentReport>;

/** A borrower's star rating and text review of a book. */
@Schema({ timestamps: true })
export class BookReview {
  @Prop({ required: true, index: true })
  bookId: string;

  @Prop({ required: true })
  reviewerId: string;

  /** 1–5 star rating. */
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  /** Optional review body – bounded to 2 000 characters. */
  @Prop({ maxlength: 2000, default: '' })
  body: string;

  /** Soft-delete timestamp. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const BookReviewSchema = SchemaFactory.createForClass(BookReview);

/** Reasons a borrower may flag a piece of library content. */
export enum ReportReason {
  INACCURATE_METADATA = 'inaccurate_metadata',
  UNSAFE_FILE = 'unsafe_file',
  ABUSIVE_REVIEW = 'abusive_review',
  COPYRIGHT_CONCERN = 'copyright_concern',
  OTHER = 'other',
}

/** Lifecycle status of a content report. */
export enum ReportStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

/** A borrower-submitted report about inaccurate, unsafe, or abusive content. */
@Schema({ timestamps: true })
export class ContentReport {
  /** The resource being reported (book ID, review ID, etc.). */
  @Prop({ required: true, index: true })
  targetId: string;

  /** Describes what kind of resource targetId points to. */
  @Prop({ required: true })
  targetType: string;

  /** User who submitted the report – kept internal, not exposed to moderators. */
  @Prop({ required: true })
  reporterId: string;

  @Prop({ enum: ReportReason, required: true })
  reason: ReportReason;

  /** Optional detail – bounded to 500 characters. */
  @Prop({ maxlength: 500, default: '' })
  detail: string;

  @Prop({ enum: ReportStatus, default: ReportStatus.OPEN })
  status: ReportStatus;

  /** Staff member currently investigating this report. */
  @Prop({ type: String, default: null })
  assignedTo: string | null;

  /** Staff resolution note. */
  @Prop({ type: String, default: null })
  resolution: string | null;
}

export const ContentReportSchema = SchemaFactory.createForClass(ContentReport);
