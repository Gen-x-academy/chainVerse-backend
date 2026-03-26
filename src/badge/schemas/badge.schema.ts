import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

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

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;
}

export const BadgeSchema = SchemaFactory.createForClass(Badge);
applySoftDeleteSchema(BadgeSchema);
