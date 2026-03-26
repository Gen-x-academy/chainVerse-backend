import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BadgeDocument = HydratedDocument<Badge>;

@Schema({ timestamps: true })
export class Badge {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  imageUrl?: string;

  @Prop()
  nftTokenId?: string;

  @Prop()
  criteria?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const BadgeSchema = SchemaFactory.createForClass(Badge);
