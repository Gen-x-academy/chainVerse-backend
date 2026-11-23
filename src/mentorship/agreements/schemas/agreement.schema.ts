import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgreementDocument = HydratedDocument<Agreement>;

export enum AgreementStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export enum ApprovalRole {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  COORDINATOR = 'coordinator',
}

/** The complete, versioned set of terms the participants agreed to. */
@Schema({ _id: false })
export class AgreementTerms {
  @Prop({ type: [String], required: true, default: [] })
  goals!: string[];

  @Prop({ required: true })
  scope!: string;

  @Prop({ required: true, min: 1 })
  durationWeeks!: number;

  @Prop({ required: true })
  cadence!: string;

  @Prop({ required: true, min: 1 })
  sessionsPerMonth!: number;

  @Prop({ required: true, min: 15 })
  sessionLengthMinutes!: number;

  /** Decimal string to avoid floating-point drift. */
  @Prop({ required: true })
  pricePerSession!: string;

  @Prop({ required: true })
  currency!: string;

  @Prop({ required: true })
  cancellationPolicy!: string;

  @Prop({ required: true })
  conductPolicy!: string;

  @Prop({ type: [String], default: [] })
  evidenceRefs!: string[];
}

export const AgreementTermsSchema = SchemaFactory.createForClass(AgreementTerms);

/** Append-only approval row, bound to the exact term version it accepted. */
@Schema({ _id: false })
export class AgreementApproval {
  @Prop({ required: true, enum: ApprovalRole })
  role!: ApprovalRole;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  termsVersion!: number;

  @Prop({ required: true })
  termsHash!: string;

  @Prop({ required: true, type: Date, default: Date.now })
  acceptedAt!: Date;
}

export const AgreementApprovalSchema =
  SchemaFactory.createForClass(AgreementApproval);

/**
 * A mentorship engagement agreement. Drafts may collect approvals; once every
 * configured approval is present the agreement activates and becomes
 * immutable. A new version/record is required for any later change.
 */
@Schema({ timestamps: true, collection: 'mentorship_agreements' })
export class Agreement {
  @Prop({ required: true, index: true })
  programId!: string;

  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ type: String, default: null })
  proposalId!: string | null;

  @Prop({ type: AgreementTermsSchema, required: true })
  terms!: AgreementTerms;

  @Prop({ required: true, default: 1 })
  termsVersion!: number;

  @Prop({ required: true })
  termsHash!: string;

  @Prop({
    required: true,
    enum: AgreementStatus,
    default: AgreementStatus.DRAFT,
  })
  status!: AgreementStatus;

  @Prop({ type: [String], required: true, default: [] })
  requiredApprovals!: ApprovalRole[];

  @Prop({ type: [AgreementApprovalSchema], default: [] })
  approvals!: AgreementApproval[];

  /** Optimistic-concurrency version for the conditional state transitions. */
  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ required: true })
  clientKey!: string;

  /** Coordinator-only note; never present in a participant snapshot. */
  @Prop({ type: String, default: null })
  privateNote!: string | null;

  @Prop({ type: Date, default: null })
  activatedAt!: Date | null;

  @Prop({ type: Date, default: null })
  endedAt!: Date | null;

  @Prop({ type: String, default: null })
  endReasonHash!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AgreementSchema = SchemaFactory.createForClass(Agreement);

AgreementSchema.index({ clientKey: 1 }, { unique: true });
AgreementSchema.index({ programId: 1, mentorId: 1, menteeId: 1 });
AgreementSchema.index({ status: 1, programId: 1 });
