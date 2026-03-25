import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
}

export const AbuseReportSchema = SchemaFactory.createForClass(AbuseReport);
