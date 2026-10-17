import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ApplicationStatus,
  MentorshipMode,
} from '../mentorship-applications.constants';

@Schema({ _id: false })
export class AvailabilitySlot {
  /** 0 = Sunday … 6 = Saturday */
  @Prop({ required: true, min: 0, max: 6 })
  dayOfWeek: number;

  /** HH:mm in the schedule's timezone */
  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;
}

export const AvailabilitySlotSchema =
  SchemaFactory.createForClass(AvailabilitySlot);

@Schema({ _id: false })
export class ApplicationSchedule {
  /** IANA timezone, e.g. "Africa/Lagos" */
  @Prop({ required: true })
  timezone: string;

  @Prop({ type: [AvailabilitySlotSchema], default: [] })
  availability: AvailabilitySlot[];

  @Prop()
  hoursPerWeek?: number;
}

export const ApplicationScheduleSchema =
  SchemaFactory.createForClass(ApplicationSchedule);

@Schema({ _id: false })
export class ApplicationConsent {
  @Prop({ required: true })
  termsAccepted: boolean;

  @Prop({ required: true })
  dataProcessingAccepted: boolean;

  /** Must equal the form's consentVersion at submission time. */
  @Prop({ required: true })
  consentVersion: string;

  @Prop({ type: Date })
  acceptedAt?: Date;
}

export const ApplicationConsentSchema =
  SchemaFactory.createForClass(ApplicationConsent);

@Schema({ _id: false })
export class SaveReceipt {
  @Prop({ required: true })
  saveId: string;

  /** Revision produced by the save – replayed back on retries. */
  @Prop({ required: true })
  revision: number;
}

export const SaveReceiptSchema = SchemaFactory.createForClass(SaveReceipt);

export type MentorshipApplicationDocument =
  HydratedDocument<MentorshipApplication>;

@Schema({ timestamps: true, collection: 'mentorship_applications' })
export class MentorshipApplication {
  @Prop({ required: true })
  menteeId: string;

  @Prop({ required: true })
  programId: string;

  /** Form version the draft's answers were written against. */
  @Prop({ required: true })
  formVersion: number;

  @Prop({
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.DRAFT,
  })
  status: ApplicationStatus;

  /**
   * True while the application counts toward the one-active-application rule
   * (draft or submitted). Backs the partial unique index below.
   */
  @Prop({ default: true })
  active: boolean;

  @Prop()
  goals?: string;

  @Prop()
  expectations?: string;

  @Prop({ type: ApplicationScheduleSchema })
  schedule?: ApplicationSchedule;

  @Prop({ type: String, enum: Object.values(MentorshipMode) })
  preferredMode?: MentorshipMode;

  /** Program answers keyed by form question key. */
  @Prop({ type: Object, default: {} })
  answers: Record<string, string>;

  @Prop({ type: ApplicationConsentSchema })
  consent?: ApplicationConsent;

  /** Monotonic revision token; bumped on every successful write. */
  @Prop({ default: 1 })
  revision: number;

  /** Revision at which each field (or `answers:<key>`) last changed. */
  @Prop({ type: Object, default: {} })
  fieldRevisions: Record<string, number>;

  /** Server time at which each field (or `answers:<key>`) last changed. */
  @Prop({ type: Object, default: {} })
  fieldUpdatedAt: Record<string, Date>;

  @Prop({ type: Date, required: true })
  lastSavedAt: Date;

  @Prop({ type: Date })
  submittedAt?: Date;

  /** Idempotency-Key supplied on create; replays return this application. */
  @Prop()
  creationKey?: string;

  /** Idempotency-Key supplied on submit. */
  @Prop()
  submissionKey?: string;

  /** Recent autosave receipts so retried saves are not re-applied. */
  @Prop({ type: [SaveReceiptSchema], default: [] })
  recentSaves: SaveReceipt[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipApplicationSchema = SchemaFactory.createForClass(
  MentorshipApplication,
);

// One active (draft or submitted) application per mentee per program.
MentorshipApplicationSchema.index(
  { menteeId: 1, programId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
// Create retries with the same Idempotency-Key resolve to the same document.
MentorshipApplicationSchema.index(
  { menteeId: 1, creationKey: 1 },
  { unique: true, partialFilterExpression: { creationKey: { $exists: true } } },
);
MentorshipApplicationSchema.index({ menteeId: 1, updatedAt: -1 });
