import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LearningStreakDocument = HydratedDocument<LearningStreak>;

@Schema({ timestamps: true, collection: 'learning_streaks' })
export class LearningStreak {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, default: false })
  qualified: boolean;

  @Prop({ required: true, default: 0 })
  activityCount: number;

  @Prop({ required: true, default: 'UTC' })
  timezone: string;

  @Prop({ required: true, default: 0 })
  streakCount: number;
}

export const LearningStreakSchema =
  SchemaFactory.createForClass(LearningStreak);

LearningStreakSchema.index({ userId: 1, date: 1 }, { unique: true });
