import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

export type AbuseReportDocument = HydratedDocument<AbuseReport>;

@Schema({ timestamps: true })
export class AbuseReport {
  @Prop({ required: true })
  reporterUserId: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  contentId: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop()
  adminNotes?: string;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;
}

export const AbuseReportSchema = SchemaFactory.createForClass(AbuseReport);
applySoftDeleteSchema(AbuseReportSchema);
