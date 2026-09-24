import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CopyStatus } from '../enums/copy-status.enum';

export type BookCopyDocument = HydratedDocument<BookCopy>;

@Schema({ timestamps: true })
export class BookCopy {
  @Prop({ required: true })
  bookId: string;

  @Prop({ required: true, unique: true, trim: true })
  identifier: string;

  @Prop({ required: true, enum: CopyStatus, default: CopyStatus.AVAILABLE })
  status: CopyStatus;

  @Prop({ default: null })
  currentHoldId?: string | null;
}

export const BookCopySchema = SchemaFactory.createForClass(BookCopy);

BookCopySchema.index({ bookId: 1, status: 1 });
