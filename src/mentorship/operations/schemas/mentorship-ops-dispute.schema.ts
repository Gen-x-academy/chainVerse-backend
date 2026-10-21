import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  DisputeReason,
  DisputeStatus,
} from '../enums/mentorship-operations.enums';

export type MentorshipOpsDisputeDocument =
  HydratedDocument<MentorshipOpsDispute>;

/**
 * A dispute raised by one participant (mentor or mentee) against an
 * engagement. Coordinators escalate and resolve through idempotent
 * intervention actions (MENTOR-116).
 */
@Schema({ timestamps: true, collection: 'mentorship_ops_disputes' })
export class MentorshipOpsDispute {
  @Prop({ required: true, index: true })
  engagementId!: string;

  @Prop({ required: true, index: true })
  programId!: string;

  @Prop({ required: true, index: true })
  raisedBy!: string;

  @Prop({ required: true, index: true })
  againstId!: string;

  @Prop({ type: String, default: null })
  mentorId!: string | null;

  @Prop({ type: String, default: null })
  menteeId!: string | null;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(DisputeReason),
  })
  reason!: DisputeReason;

  @Prop({ type: String, default: '', maxlength: 2000 })
  details!: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(DisputeStatus),
    default: DisputeStatus.OPEN,
    index: true,
  })
  status!: DisputeStatus;

  /** Coordinator note recorded on escalate/resolve; never shown to applicants. */
  @Prop({ type: String, default: null, maxlength: 2000 })
  resolution!: string | null;

  @Prop({ type: String, default: null })
  resolvedBy!: string | null;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  /**
   * `${engagementId}:${raisedBy}` while the dispute is open, unset once it is
   * resolved or dismissed – the partial unique index makes "one open dispute
   * per engagement per raiser" an atomic database guarantee.
   */
  @Prop({ type: String })
  activeKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipOpsDisputeSchema =
  SchemaFactory.createForClass(MentorshipOpsDispute);

MentorshipOpsDisputeSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
);
MentorshipOpsDisputeSchema.index({ programId: 1, status: 1, createdAt: -1 });
