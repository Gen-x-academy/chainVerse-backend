import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BookCopyDocument = HydratedDocument<BookCopy>;

export enum CopyCondition {
  NEW = 'new',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DAMAGED = 'damaged',
}

export enum CopyPhysicalStatus {
  AVAILABLE = 'available',
  CHECKED_OUT = 'checked_out',
  ON_HOLD = 'on_hold',
  IN_REPAIR = 'in_repair',
  LOST = 'lost',
  WITHDRAWN = 'withdrawn',
}

@Schema({ _id: false })
export class ConditionHistoryEntry {
  @Prop({ required: true, enum: CopyCondition })
  condition: CopyCondition;

  @Prop({ required: true })
  recordedAt: Date;

  @Prop({ required: true })
  recordedBy: string;

  @Prop({ trim: true })
  note?: string;
}

export const ConditionHistoryEntrySchema =
  SchemaFactory.createForClass(ConditionHistoryEntry);

@Schema({ timestamps: true, collection: 'library_book_copies' })
export class BookCopy {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Book', index: true })
  bookId: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true, sparse: true })
  barcode: string;

  @Prop({ required: true, enum: CopyPhysicalStatus, default: CopyPhysicalStatus.AVAILABLE, index: true })
  status: CopyPhysicalStatus;

  @Prop({ required: true, enum: CopyCondition, default: CopyCondition.GOOD })
  condition: CopyCondition;

  @Prop({ type: [ConditionHistoryEntrySchema], default: [] })
  conditionHistory: ConditionHistoryEntry[];

  @Prop({ trim: true })
  branch?: string;

  @Prop({ trim: true })
  shelf?: string;

  @Prop({ trim: true })
  room?: string;

  @Prop({ type: Types.ObjectId, ref: 'LibraryLocation' })
  locationId?: Types.ObjectId;

  @Prop()
  acquiredAt?: Date;

  @Prop({ trim: true })
  acquisitionSource?: string;

  @Prop({ trim: true })
  donorName?: string;

  @Prop()
  lastLoanAt?: Date;

  @Prop({ min: 0 })
  repairCost?: number;

  @Prop()
  repairRequestedAt?: Date;

  @Prop()
  repairCompletedAt?: Date;

  @Prop()
  retiredAt?: Date;

  @Prop({ trim: true })
  retiredReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BookCopySchema = SchemaFactory.createForClass(BookCopy);
BookCopySchema.index({ bookId: 1, status: 1 });
BookCopySchema.index({ barcode: 1 }, { unique: true });
