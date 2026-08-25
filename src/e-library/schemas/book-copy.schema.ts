import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BookCopyDocument = HydratedDocument<BookCopy>;

export enum CopyStatus {
  AVAILABLE = 'available',
  CHECKED_OUT = 'checked_out',
  RESERVED = 'reserved',
  IN_REPAIR = 'in_repair',
  WITHDRAWN = 'withdrawn',
}

export enum CopyCondition {
  NEW = 'new',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DAMAGED = 'damaged',
}

/** A single entry in the condition audit trail. */
class ConditionHistoryEntry {
  @Prop({ required: true, type: String, enum: CopyCondition })
  condition: CopyCondition;

  @Prop({ required: true })
  changedAt: Date;

  /** ID of the staff member who recorded the change. */
  @Prop({ required: true })
  changedBy: string;

  @Prop()
  notes?: string;
}

/**
 * BookCopy - represents one lendable physical copy of a bibliographic Book.
 *
 * Each copy has its own barcode, branch/location, acquisition metadata,
 * circulation status, and a full condition-change history.
 *
 * For issue #979: model physical copies with barcode and condition history.
 */
@Schema({ timestamps: true, collection: 'elibrary_book_copies' })
export class BookCopy {
  /** Reference to the parent Book document. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Book', index: true })
  bookId: Types.ObjectId;

  /** Human-scannable barcode - unique across all copies. */
  @Prop({ required: true, unique: true, index: true, trim: true })
  barcode: string;

  /** Physical branch or shelf location. */
  @Prop({ required: true, trim: true })
  branch: string;

  @Prop({ trim: true })
  shelfLocation?: string;

  @Prop()
  acquisitionDate?: Date;

  @Prop()
  acquisitionCost?: number;

  @Prop({
    type: String,
    enum: CopyStatus,
    default: CopyStatus.AVAILABLE,
    index: true,
  })
  status: CopyStatus;

  @Prop({
    type: String,
    enum: CopyCondition,
    default: CopyCondition.GOOD,
  })
  condition: CopyCondition;

  /**
   * Append-only log of condition changes. New entries are pushed; existing
   * entries must never be removed or modified.
   */
  @Prop({ type: [ConditionHistoryEntry], default: [] })
  conditionHistory: ConditionHistoryEntry[];
}

export const BookCopySchema = SchemaFactory.createForClass(BookCopy);