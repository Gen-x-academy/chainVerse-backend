import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { HoldAuditAction } from '../enums/hold-audit-action.enum';

export type HoldAuditLogDocument = HydratedDocument<HoldAuditLog>;

@Schema({ timestamps: true })
export class HoldAuditLog {
  @Prop({ required: true })
  holdId: string;

  @Prop({ required: true, enum: HoldAuditAction })
  action: HoldAuditAction;

  @Prop({ default: null })
  actorId?: string | null;

  @Prop({ default: null })
  actorRole?: string | null;

  @Prop({ type: Object, default: null })
  details?: Record<string, unknown> | null;
}

export const HoldAuditLogSchema = SchemaFactory.createForClass(HoldAuditLog);

HoldAuditLogSchema.index({ holdId: 1, createdAt: 1 });
