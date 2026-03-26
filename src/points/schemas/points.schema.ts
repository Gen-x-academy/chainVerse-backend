import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PointsRecordDocument = HydratedDocument<PointsRecord>;

@Schema({ timestamps: true })
export class PointsRecord {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  points: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  activityType: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const PointsRecordSchema = SchemaFactory.createForClass(PointsRecord);
