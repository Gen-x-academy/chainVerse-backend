import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipBlockDocument = HydratedDocument<MentorshipBlock>;

/**
 * A participant's block of another user. Blocks apply in both directions for
 * matching and can never be overridden by a coordinator. The reason is
 * private to the blocker and is never shown to the blocked user.
 */
@Schema({ timestamps: true, collection: 'mentorship_blocks' })
export class MentorshipBlock {
  @Prop({ required: true, index: true })
  blockerId!: string;

  @Prop({ required: true, index: true })
  blockedId!: string;

  @Prop({ type: String, default: null })
  reason!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipBlockSchema =
  SchemaFactory.createForClass(MentorshipBlock);

MentorshipBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
