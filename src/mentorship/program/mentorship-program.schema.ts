import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum MentorshipDeliveryMode {
  REMOTE = 'remote',
  IN_PERSON = 'in_person',
  HYBRID = 'hybrid',
}

export enum MentorshipProgramWorkflowStatus {
  IDLE = 'idle',
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

/** Deliberately broad location data. Exact addresses and coordinates are never accepted or returned. */
@Schema({ _id: false })
export class MentorshipProgramLocation {
  @Prop({ required: true, trim: true, maxlength: 2 })
  countryCode: string;
  @Prop({ required: true, trim: true, maxlength: 120 })
  region: string;
  @Prop({ required: true, trim: true, maxlength: 120 })
  city: string;
  @Prop({ trim: true, maxlength: 120 })
  venueLabel?: string;
}
export const MentorshipProgramLocationSchema = SchemaFactory.createForClass(
  MentorshipProgramLocation,
);

@Schema({ timestamps: true, collection: 'mentorship_programs' })
export class MentorshipProgram {
  @Prop({ required: true, trim: true, maxlength: 160 })
  name: string;
  @Prop({ required: true, index: true })
  organizationId: string;
  @Prop({ required: true, index: true })
  createdBy: string;
  @Prop({ required: true, enum: MentorshipDeliveryMode, index: true })
  deliveryMode: MentorshipDeliveryMode;
  @Prop({ trim: true, maxlength: 80 })
  remotePlatform?: string;
  @Prop({ trim: true, maxlength: 1000 })
  remoteJoinInstructions?: string;
  @Prop({ type: MentorshipProgramLocationSchema, default: null })
  location: MentorshipProgramLocation | null;
  /** Public, derived labels used by discovery; no private location details. */
  @Prop({ type: [String], default: [] })
  discoveryLabels: string[];
  /** Maintained by booking workflows; mode/location changes are blocked once non-zero. */
  @Prop({ default: 0, min: 0 })
  activeBookingCount: number;
  @Prop({ enum: MentorshipProgramWorkflowStatus, default: MentorshipProgramWorkflowStatus.IDLE })
  workflowStatus: MentorshipProgramWorkflowStatus;
  @Prop({ default: 0 })
  workflowAttempts: number;
  @Prop({ trim: true, maxlength: 240, default: null })
  workflowError: string | null;
  @Prop({ default: 0 })
  version: number;
  /** Scoped idempotency key for create/update retries; never exposed publicly. */
  @Prop({ trim: true, maxlength: 64 })
  lastMutationKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export type MentorshipProgramDocument = HydratedDocument<MentorshipProgram>;
export const MentorshipProgramSchema = SchemaFactory.createForClass(MentorshipProgram);
MentorshipProgramSchema.index({ organizationId: 1, createdBy: 1, lastMutationKey: 1 });
MentorshipProgramSchema.index({ organizationId: 1, deliveryMode: 1 });
