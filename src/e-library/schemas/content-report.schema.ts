import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContentReportDocument = HydratedDocument<ContentReport>;

export enum ReportTargetType {
  BOOK = 'book',
  REVIEW = 'review',
  FILE = 'file',
}

export enum ReportReasonType {
  INACCURATE_METADATA = 'inaccurate_metadata',
  UNSAFE_FILE = 'unsafe_file',
  ABUSIVE_REVIEW = 'abusive_review',
  COPYRIGHT = 'copyright',
}

export enum ReportStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Schema({ timestamps: true, collection: 'library_content_reports' })
export class ContentReport {
  @Prop({ required: true })
  reporterId: string;

  @Prop({ required: true, enum: ReportTargetType })
  targetType: ReportTargetType;

  @Prop({ required: true, index: true })
  targetId: string;

  @Prop({ required: true, enum: ReportReasonType })
  reasonType: ReportReasonType;

  @Prop({ required: true, maxlength: 5000 })
  description: string;

  @Prop({ required: true, enum: ReportStatus, default: ReportStatus.OPEN })
  status: ReportStatus;

  @Prop({ default: null })
  assignedTo: string | null;

  @Prop({ default: null })
  resolutionNotes: string | null;

  @Prop({ required: true, index: true })
  dedupKey: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ContentReportSchema =
  SchemaFactory.createForClass(ContentReport);
ContentReportSchema.index({ dedupKey: 1 }, { unique: true });
ContentReportSchema.index({ reporterId: 1, createdAt: -1 });
ContentReportSchema.index({ status: 1, targetType: 1 });
