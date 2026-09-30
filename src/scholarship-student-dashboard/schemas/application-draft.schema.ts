import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ApplicationDraftDocument = HydratedDocument<ApplicationDraft>;

/**
 * A saved-but-not-yet-submitted scholarship application draft owned by one
 * applicant for one program.
 *
 * Privacy notes:
 *   - `answers` may contain applicant PII.  Documents are scoped to the owning
 *     applicant via `applicantId`; no other party may read them through the
 *     student-dashboard API.
 *
 * Migration notes:
 *   - New collection `scholarship_application_drafts`.
 *   - The compound unique index `{ programId, applicantId }` ensures at most
 *     one active draft per (program, applicant) pair.
 */
@Schema({ timestamps: true, collection: 'scholarship_application_drafts' })
export class ApplicationDraft {
  /** Tenant scope — mirrors the program's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  @Prop({ required: true, index: true })
  applicantId: string;

  /**
   * Partial answers keyed by field ObjectId (string representation).
   * Stored as a plain object so applicants can save progress without
   * completing all required fields.
   */
  @Prop({ type: Object, default: {} })
  answers: Record<string, string>;

  /** Optional personal statement draft. */
  @Prop({ trim: true, maxlength: 5000 })
  statement?: string;

  /**
   * Whether the draft has been submitted.  Once true the draft is read-only
   * and a real ScholarshipApplication document exists.
   */
  @Prop({ default: false })
  submitted: boolean;

  /** Timestamp when the draft was submitted (transitioned to a real application). */
  @Prop({ type: Date, default: null })
  submittedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApplicationDraftSchema =
  SchemaFactory.createForClass(ApplicationDraft);

ApplicationDraftSchema.index(
  { programId: 1, applicantId: 1 },
  { unique: true },
);
ApplicationDraftSchema.index({ applicantId: 1, submitted: 1 });
