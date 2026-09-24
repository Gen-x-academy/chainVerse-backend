import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebhookLogDocument = HydratedDocument<WebhookLog>;

export enum WebhookLogStatus {
  RECEIVED = 'received',
  VERIFIED = 'verified',
  PROCESSED = 'processed',
  FAILED = 'failed',
  REJECTED_SIGNATURE = 'rejected_signature',
  REJECTED_REPLAY = 'rejected_replay',
}

@Schema({ timestamps: true, collection: 'webhook_logs' })
export class WebhookLog {
  @Prop({ required: true })
  webhookId!: string;

  @Prop({ required: true })
  source!: string;

  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true })
  receivedAt!: Date;

  @Prop({ type: Date, default: null })
  processedAt: Date | null;

  @Prop({ required: true, enum: WebhookLogStatus })
  status!: WebhookLogStatus;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WebhookLogSchema = SchemaFactory.createForClass(WebhookLog);
