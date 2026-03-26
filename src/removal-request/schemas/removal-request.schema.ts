import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RemovalRequestDocument = HydratedDocument<RemovalRequest>;

@Schema({ timestamps: true })
export class RemovalRequest {
  @Prop({ required: true })
  requestedBy: string;

  @Prop({ required: true })
  contentId: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop()
  adminNotes?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const RemovalRequestSchema = SchemaFactory.createForClass(RemovalRequest);
