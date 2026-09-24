import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScholarshipApplicationDocument =
  HydratedDocument<ScholarshipApplication>;

export enum ScholarshipApplicationStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

/**
 * Embedded answer sub-document stored within a scholarship application.
 *
 * Privacy notes:
 *   - Answers may contain applicant PII (personal statements, background info).
 *   - The entire `answers` array is scoped to the owning application which is
 *     itself tenant-scoped via `organizationId`.
 *   - Staff with OWNER / ADMIN / INSTRUCTOR role in the organization may read
 *     answers; no other party may access them via the public API.
 *
 * Migration notes:
 *   - The `answers` field uses `default: []` so existing application documents
 *     written before this migration are backward-compatible.  No data migration
 *     script is required; old documents will simply present an empty array.
 */
@Schema({ _id: false })
export class ApplicationAnswer {
  /** References `ScholarshipProgram.formFields[].fieldId`. */
  @Prop({ required: true, type: Types.ObjectId })
  fieldId: Types.ObjectId;

  /** Applicant's text response for this field. */
  @Prop({ trim: true })
  value?: string;

  /**
   * Server-computed word count of `value` at the time of submission.
   * Stored for auditability; recalculated on every write.
   */
  @Prop({ min: 0, default: 0 })
  wordCount: number;
}

export const ApplicationAnswerSchema =
  SchemaFactory.createForClass(ApplicationAnswer);

@Schema({ timestamps: true, collection: 'scholarship_applications' })
export class ScholarshipApplication {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, index: true })
  applicantId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ProgramTermsVersion' })
  acceptedTermsVersionId: Types.ObjectId;

  @Prop({ required: true })
  acceptedTermsVersionNumber: number;

  @Prop({ type: Object, required: true })
  acceptedTermsSnapshot: Record<string, unknown>;

  @Prop({
    required: true,
    enum: ScholarshipApplicationStatus,
    default: ScholarshipApplicationStatus.SUBMITTED,
    index: true,
  })
  status: ScholarshipApplicationStatus;

  @Prop({ trim: true })
  statement?: string;

  /**
   * Form-field answers submitted with the application.
   *
   * Default is an empty array so documents written before this field was
   * added continue to deserialize correctly (backward-compatible migration).
   */
  @Prop({ type: [ApplicationAnswerSchema], default: [] })
  answers: ApplicationAnswer[];

  @Prop()
  decidedAt?: Date;

  @Prop()
  decidedBy?: string;

  @Prop()
  decisionReason?: string;

  /**
   * Withdrawal fields — populated only when status transitions to WITHDRAWN.
   *
   * Review history fields (decidedAt, decidedBy, decisionReason) are NEVER
   * cleared on withdrawal; the full audit trail is preserved.
   *
   * Privacy: withdrawalReason may contain applicant PII and is scoped to
   * the owning tenant via organizationId.
   */
  @Prop()
  withdrawalReasonCategory?: string;

  @Prop({ trim: true, maxlength: 500 })
  withdrawalReason?: string;

  @Prop()
  withdrawnAt?: Date;

  @Prop()
  withdrawnBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipApplicationSchema =
  SchemaFactory.createForClass(ScholarshipApplication);
ScholarshipApplicationSchema.index({ programId: 1, applicantId: 1 }, { unique: true });
ScholarshipApplicationSchema.index({ applicantId: 1, status: 1 });
ScholarshipApplicationSchema.index({ organizationId: 1, programId: 1, status: 1 });
