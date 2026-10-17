import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EngagementStatus } from '../mentorship.constants';
import { MatchTerms, MatchTermsSchema } from './match-terms.schema';

export type MentorshipEngagementDocument =
  HydratedDocument<MentorshipEngagement>;

/** An activated 1-on-1 mentorship created from an accepted proposal. */
@Schema({ timestamps: true, collection: 'mentorship_engagements' })
export class MentorshipEngagement {
  /** Unique: one proposal can never produce two engagements. */
  @Prop({ required: true, unique: true })
  proposalId!: string;

  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ required: true })
  programId!: string;

  @Prop({ type: MatchTermsSchema, required: true })
  terms!: MatchTerms;

  @Prop({ required: true })
  termsVersion!: number;

  @Prop({ required: true })
  termsHash!: string;

  @Prop({
    required: true,
    enum: Object.values(EngagementStatus),
    default: EngagementStatus.ACTIVE,
  })
  status!: EngagementStatus;

  @Prop({ default: false })
  coordinatorAssisted!: boolean;

  @Prop({ required: true, type: Date })
  activatedAt!: Date;

  /** `mentor:mentee:program` while active; prevents duplicate live engagements. */
  @Prop({ type: String })
  activeKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipEngagementSchema =
  SchemaFactory.createForClass(MentorshipEngagement);

MentorshipEngagementSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
);
