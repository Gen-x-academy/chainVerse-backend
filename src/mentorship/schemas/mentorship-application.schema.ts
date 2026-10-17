import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ApplicationStatus,
  ReservationStatus,
} from '../enums/mentorship.enums';

export type MentorshipApplicationDocument =
  HydratedDocument<MentorshipApplication>;

/**
 * Consent captured for this application only. It is never copied from a
 * previous application: a reapplication must collect it again against the
 * program's current consent version.
 */
@Schema({ _id: false })
export class ApplicationConsent {
  @Prop({ required: true })
  version: string;

  @Prop({ type: Date, required: true })
  acceptedAt: Date;
}

const ApplicationConsentSchema =
  SchemaFactory.createForClass(ApplicationConsent);

@Schema({ _id: false })
export class SeatReservation {
  @Prop({
    type: String,
    enum: Object.values(ReservationStatus),
    default: ReservationStatus.NONE,
  })
  status: ReservationStatus;

  @Prop({ type: Date, default: null })
  heldAt: Date | null;

  @Prop({ type: Date, default: null })
  releasedAt: Date | null;
}

const SeatReservationSchema = SchemaFactory.createForClass(SeatReservation);

@Schema({ _id: false })
export class InformationResponse {
  @Prop({ required: true, maxlength: 5000 })
  message: string;

  @Prop({ type: Date, required: true })
  respondedAt: Date;
}

const InformationResponseSchema =
  SchemaFactory.createForClass(InformationResponse);

/**
 * Marker for the last state transition. Written in the same update that
 * changes `status`, so a retry that finds its own key here knows the
 * transition already happened and only the decision insert may be missing.
 */
@Schema({ _id: false })
export class LastTransition {
  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, required: true })
  decisionId: Types.ObjectId;

  /** Full decision document, replayed if the insert did not land. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  decision: Record<string, unknown>;
}

const LastTransitionSchema = SchemaFactory.createForClass(LastTransition);

/**
 * An applicant's request to join a mentorship program.
 *
 * Applications are never deleted. Withdrawal and rejection close them; a
 * reapplication creates a new document linked through
 * `previousApplicationId` / `supersededByApplicationId`.
 */
@Schema({ timestamps: true, collection: 'mentorship_applications' })
export class MentorshipApplication {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  programId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  applicantId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.SUBMITTED,
    index: true,
  })
  status: ApplicationStatus;

  /** True while the application occupies the applicant's single live slot. */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ required: true, maxlength: 5000 })
  motivation: string;

  @Prop({ type: [String], default: [] })
  goals: string[];

  @Prop({ type: ApplicationConsentSchema, required: true })
  consent: ApplicationConsent;

  /** 1 for a first application, incremented for each reapplication. */
  @Prop({ type: Number, default: 1, min: 1 })
  attemptNumber: number;

  @Prop({ type: Types.ObjectId, default: null })
  previousApplicationId: Types.ObjectId | null;

  /** First application in the chain; equals `_id` for a first application. */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  rootApplicationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  supersededByApplicationId: Types.ObjectId | null;

  @Prop({ type: SeatReservationSchema, default: () => ({}) })
  reservation: SeatReservation;

  @Prop({ type: [InformationResponseSchema], default: [] })
  informationResponses: InformationResponse[];

  @Prop({ type: Date, default: null })
  withdrawnAt: Date | null;

  @Prop({ type: Date, default: null })
  closedAt: Date | null;

  /** Idempotency key that created this application (submit or reapply). */
  @Prop({ type: String, required: true })
  submissionKey: string;

  @Prop({ type: LastTransitionSchema, default: null })
  lastTransition: LastTransition | null;

  /** Optimistic-concurrency counter; bumped on every state change. */
  @Prop({ type: Number, default: 0 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipApplicationSchema = SchemaFactory.createForClass(
  MentorshipApplication,
);

// One live application per applicant per program. Closed applications drop
// out of the index, which is what makes a reapplication possible.
MentorshipApplicationSchema.index(
  { programId: 1, applicantId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

// A retried submit / reapply with the same key resolves to the same document.
MentorshipApplicationSchema.index(
  { applicantId: 1, submissionKey: 1 },
  { unique: true },
);

MentorshipApplicationSchema.index({ programId: 1, status: 1, createdAt: -1 });
