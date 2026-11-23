import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum MentorshipSessionStatus {
  BOOKED = 'booked',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum CancellationActorType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  STAFF = 'staff',
}

@Schema({ _id: false })
export class SessionCancellation {
  @Prop({ required: true, enum: CancellationActorType })
  actorType!: CancellationActorType;

  @Prop({ required: true })
  actorId!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true })
  policyVersion!: string;

  @Prop({ required: true })
  noticePeriodMinutes!: number;

  @Prop({ required: true })
  feeConsequence!: string;

  @Prop({ required: true })
  cancelledAt!: Date;

  @Prop({ required: true })
  instructionId!: string;
}

@Schema({ timestamps: true, collection: 'mentorship_sessions' })
export class MentorshipSession {
  @Prop({ required: true, index: true })
  agreementId!: string;

  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ required: true })
  scheduledStart!: Date;

  @Prop({ required: true })
  scheduledEnd!: Date;

  @Prop({
    required: true,
    enum: MentorshipSessionStatus,
    default: MentorshipSessionStatus.BOOKED,
  })
  status!: MentorshipSessionStatus;

  @Prop({ type: Object, default: null })
  cancellation!: SessionCancellation | null;

  @Prop({ required: true })
  idempotencyKey!: string;
}

export type MentorshipSessionDocument = HydratedDocument<MentorshipSession>;
export const MentorshipSessionSchema =
  SchemaFactory.createForClass(MentorshipSession);
MentorshipSessionSchema.index(
  { agreementId: 1, idempotencyKey: 1 },
  { unique: true },
);
