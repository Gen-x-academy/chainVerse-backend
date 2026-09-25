import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationEventDocument = HydratedDocument<NotificationEvent>;

export enum LibraryEventType {
  CHECKOUT = 'checkout',
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
  RENEWAL = 'renewal',
  HOLD_READY = 'hold_ready',
  HOLD_EXPIRED = 'hold_expired',
  RETURN = 'return',
  CHARGE = 'charge',
  PAYMENT = 'payment',
  LICENSE_EXPIRY = 'license_expiry',
}

@Schema({ _id: false })
export class ConsumerStatus {
  @Prop({ required: true })
  consumerId: string;

  @Prop({ required: true, default: 'pending' })
  status: string;

  @Prop({ default: null })
  processedAt: Date | null;
}

export const ConsumerStatusSchema =
  SchemaFactory.createForClass(ConsumerStatus);

@Schema({ timestamps: true, collection: 'library_notification_events' })
export class NotificationEvent {
  @Prop({ required: true, enum: LibraryEventType })
  eventType: LibraryEventType;

  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true, default: 1 })
  schemaVersion: number;

  @Prop({ type: Object, required: true, default: {} })
  payload: Record<string, unknown>;

  @Prop({ required: true })
  publishedAt: Date;

  @Prop({ type: [ConsumerStatusSchema], default: [] })
  consumerStatuses: ConsumerStatus[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationEventSchema =
  SchemaFactory.createForClass(NotificationEvent);
NotificationEventSchema.index({ eventType: 1, publishedAt: -1 });
NotificationEventSchema.index({ eventId: 1 }, { unique: true });
