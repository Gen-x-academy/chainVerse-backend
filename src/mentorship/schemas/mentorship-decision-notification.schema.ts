import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ApplicantReasonCode,
  DecisionType,
  NotificationDispatchStatus,
} from '../enums/mentorship.enums';

export type MentorshipDecisionNotificationDocument =
  HydratedDocument<MentorshipDecisionNotification>;

/**
 * Outbox row for an applicant-facing decision notification.
 *
 * Decision history is immutable, so delivery state lives here instead. The
 * unique `decisionId` index means a retried decision can never enqueue a
 * second notification. Only applicant-visible fields are copied in.
 */
@Schema({ timestamps: true, collection: 'mentorship_decision_notifications' })
export class MentorshipDecisionNotification {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  decisionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  applicationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  applicantId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(DecisionType), required: true })
  decisionType: DecisionType;

  @Prop({
    type: String,
    enum: Object.values(ApplicantReasonCode),
    required: true,
  })
  applicantReasonCode: ApplicantReasonCode;

  @Prop({ type: String, default: null })
  applicantMessage: string | null;

  @Prop({ type: String, required: true })
  programTitle: string;

  /** Earliest time the job may deliver this notification. */
  @Prop({ type: Date, required: true })
  dispatchAfter: Date;

  @Prop({
    type: String,
    enum: Object.values(NotificationDispatchStatus),
    default: NotificationDispatchStatus.PENDING,
  })
  status: NotificationDispatchStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  /** Claim lease; a crashed worker's claim expires and the row is retried. */
  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;
}

export const MentorshipDecisionNotificationSchema =
  SchemaFactory.createForClass(MentorshipDecisionNotification);

MentorshipDecisionNotificationSchema.index({ status: 1, dispatchAfter: 1 });
