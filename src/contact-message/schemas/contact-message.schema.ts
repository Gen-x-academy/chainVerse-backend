import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ContactMessageCategory,
  ContactMessagePriority,
  ContactMessageStatus,
} from '../enums/contact-message.enums';

export type ContactMessageDocument = HydratedDocument<ContactMessage>;

@Schema({ _id: false })
export class StatusHistoryEntry {
  @Prop({ type: String, required: true, enum: ContactMessageStatus })
  status: ContactMessageStatus;

  @Prop({ type: String, required: true })
  changedBy: string;

  @Prop({ type: Date, required: true })
  changedAt: Date;

  @Prop({ type: String })
  note?: string;
}

export const StatusHistoryEntrySchema =
  SchemaFactory.createForClass(StatusHistoryEntry);

@Schema({ timestamps: true, collection: 'contact_messages' })
export class ContactMessage {
  @Prop({ type: String, required: true })
  requesterName: string;

  @Prop({ type: String, required: true })
  requesterEmail: string;

  @Prop({ type: String, required: true })
  subject: string;

  @Prop({ type: String, required: true })
  body: string;

  @Prop({ type: String, required: true, enum: ContactMessageCategory, default: ContactMessageCategory.GENERAL })
  category: ContactMessageCategory;

  @Prop({ type: String, required: true, enum: ContactMessagePriority, default: ContactMessagePriority.MEDIUM })
  priority: ContactMessagePriority;

  @Prop({ type: String, required: true, enum: ContactMessageStatus, default: ContactMessageStatus.OPEN })
  status: ContactMessageStatus;

  @Prop({ type: String, default: null })
  assigneeId?: string | null;

  @Prop({ type: [StatusHistoryEntrySchema], default: [] })
  statusHistory: StatusHistoryEntry[];
}

export const ContactMessageSchema =
  SchemaFactory.createForClass(ContactMessage);
