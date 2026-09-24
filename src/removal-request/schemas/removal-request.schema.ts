import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

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

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;
}

export const RemovalRequestSchema =
  SchemaFactory.createForClass(RemovalRequest);
applySoftDeleteSchema(RemovalRequestSchema);
