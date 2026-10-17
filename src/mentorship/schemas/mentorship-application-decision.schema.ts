import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ApplicantReasonCode,
  ApplicationStatus,
  CommunicationPolicy,
  DecisionActorKind,
  DecisionType,
  InternalReasonCode,
} from '../enums/mentorship.enums';

export type MentorshipApplicationDecisionDocument =
  HydratedDocument<MentorshipApplicationDecision>;

/**
 * One immutable entry in an application's decision history.
 *
 * Applicant-visible fields (`applicantReasonCode`, `applicantMessage`) and
 * internal fields (`internalReasonCode`, `internalNote`) live side by side
 * here but are projected separately on every read path.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'mentorship_application_decisions',
})
export class MentorshipApplicationDecision {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  applicationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  applicantId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(DecisionType), required: true })
  type: DecisionType;

  @Prop({
    type: String,
    enum: Object.values(ApplicationStatus),
    required: true,
  })
  fromStatus: ApplicationStatus;

  @Prop({
    type: String,
    enum: Object.values(ApplicationStatus),
    required: true,
  })
  toStatus: ApplicationStatus;

  /** Application `version` after this decision; orders the history. */
  @Prop({ type: Number, required: true })
  sequence: number;

  @Prop({
    type: String,
    enum: Object.values(ApplicantReasonCode),
    required: true,
  })
  applicantReasonCode: ApplicantReasonCode;

  @Prop({ type: String, default: null, maxlength: 2000 })
  applicantMessage: string | null;

  @Prop({
    type: String,
    enum: Object.values(InternalReasonCode),
    default: null,
  })
  internalReasonCode: InternalReasonCode | null;

  @Prop({ type: String, default: null, maxlength: 5000 })
  internalNote: string | null;

  /** When the decision takes effect from the applicant's point of view. */
  @Prop({ type: Date, required: true })
  effectiveAt: Date;

  @Prop({
    type: String,
    enum: Object.values(CommunicationPolicy),
    required: true,
  })
  communicationPolicy: CommunicationPolicy;

  @Prop({ type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @Prop({ type: String, required: true })
  actorRole: string;

  @Prop({
    type: String,
    enum: Object.values(DecisionActorKind),
    required: true,
  })
  actorKind: DecisionActorKind;

  @Prop({ type: String, required: true })
  idempotencyKey: string;

  /** Hash of the request body; a reused key with a different body is a 409. */
  @Prop({ type: String, required: true })
  requestHash: string;

  createdAt?: Date;
}

export const MentorshipApplicationDecisionSchema = SchemaFactory.createForClass(
  MentorshipApplicationDecision,
);

MentorshipApplicationDecisionSchema.index(
  { applicationId: 1, idempotencyKey: 1 },
  { unique: true },
);
MentorshipApplicationDecisionSchema.index(
  { applicationId: 1, sequence: 1 },
  { unique: true },
);

export const FORBIDDEN_DECISION_OPERATIONS = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
] as const;

export class DecisionHistoryImmutableError extends Error {
  constructor(operation: string) {
    super(
      `Mentorship decision history is append-only; "${operation}" is not permitted`,
    );
    this.name = 'DecisionHistoryImmutableError';
  }
}

/** Installs append-only guards; exported so it can be tested on a bare schema. */
export function applyDecisionImmutability(schema: MongooseSchema): void {
  for (const operation of FORBIDDEN_DECISION_OPERATIONS) {
    schema.pre(operation as 'updateOne', function () {
      throw new DecisionHistoryImmutableError(operation);
    });
  }

  schema.pre('save', function (this: { isNew: boolean }) {
    if (!this.isNew) {
      throw new DecisionHistoryImmutableError(
        'save (update of existing entry)',
      );
    }
  });

  schema.pre('bulkWrite', function () {
    throw new DecisionHistoryImmutableError('bulkWrite');
  });
}

applyDecisionImmutability(MentorshipApplicationDecisionSchema);
