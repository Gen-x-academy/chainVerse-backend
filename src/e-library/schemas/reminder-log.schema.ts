import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReminderLogDocument = HydratedDocument<ReminderLog>;

export enum ReminderType {
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
}

export enum ReminderStatus {
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
  SUPPRESSED = 'suppressed',
  RETURNED = 'returned',
}

@Schema({ timestamps: true, collection: 'library_reminder_logs' })
export class ReminderLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Loan', index: true })
  loanId: Types.ObjectId;

  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, enum: ReminderType, index: true })
  reminderType: ReminderType;

  @Prop({ required: true })
  channel: string;

  @Prop({
    required: true,
    enum: ReminderStatus,
    default: ReminderStatus.SCHEDULED,
    index: true,
  })
  status: ReminderStatus;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: Number, default: 0 })
  escalationDay: number;

  @Prop({ type: String, default: null })
  failureReason: string | null;

  @Prop({ type: Date, default: null })
  dueDate: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReminderLogSchema =
  SchemaFactory.createForClass(ReminderLog);
ReminderLogSchema.index({ loanId: 1, reminderType: 1, status: 1 });
ReminderLogSchema.index({ patronId: 1, reminderType: 1, scheduledAt: -1 });
ReminderLogSchema.index({ status: 1, scheduledAt: 1 });
