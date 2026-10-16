import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BadgeAwardDocument = HydratedDocument<BadgeAward>;

@Schema({ timestamps: true, collection: 'badge_awards' })
export class BadgeAward {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  badgeId: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const BadgeAwardSchema = SchemaFactory.createForClass(BadgeAward);
BadgeAwardSchema.index({ userId: 1, badgeId: 1 }, { unique: true });
