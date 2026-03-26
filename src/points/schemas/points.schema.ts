import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

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

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;
}

export const PointsRecordSchema = SchemaFactory.createForClass(PointsRecord);
applySoftDeleteSchema(PointsRecordSchema);
