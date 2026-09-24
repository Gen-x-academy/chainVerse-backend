import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScholarshipProgramDocument = HydratedDocument<ScholarshipProgram>;

/**
 * Full program lifecycle states (issue #1122).
 *
 * Legal transitions:
 *   DRAFT       → PUBLISHED
 *   PUBLISHED   → PAUSED
 *   PAUSED      → PUBLISHED
 *   PUBLISHED   → CLOSED
 *   CLOSED      → ARCHIVED
 *
 * Archived programs are immutable and remain queryable for audit purposes.
 *
 * Migration notes:
 *   - Pre-existing documents written with the old `OPEN` string value are
 *     NOT automatically migrated.  Run the one-off migration script
 *     `scripts/migrate-scholarship-open-to-published.ts` to rename them to
 *     `published`.  Until the script is run, old documents will fail enum
 *     validation on update; reads will still succeed because Mongoose does
 *     not validate on find.
 *   - `OPEN` has been replaced by `PUBLISHED` to align with lifecycle
 *     semantics.  Clients that hard-code `status=open` must be updated.
 */
export enum ScholarshipProgramStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  PAUSED = 'paused',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

/**
 * Permitted status transitions.  Any transition not present in this map
 * is illegal and will be rejected with BIZ_PROGRAM_INVALID_TRANSITION.
 */
export const PROGRAM_STATUS_TRANSITIONS: Readonly<
  Record<ScholarshipProgramStatus, ScholarshipProgramStatus[]>
> = {
  [ScholarshipProgramStatus.DRAFT]: [ScholarshipProgramStatus.PUBLISHED],
  [ScholarshipProgramStatus.PUBLISHED]: [
    ScholarshipProgramStatus.PAUSED,
    ScholarshipProgramStatus.CLOSED,
  ],
  [ScholarshipProgramStatus.PAUSED]: [ScholarshipProgramStatus.PUBLISHED],
  [ScholarshipProgramStatus.CLOSED]: [ScholarshipProgramStatus.ARCHIVED],
  [ScholarshipProgramStatus.ARCHIVED]: [],
};

/**
 * One entry in the status-change history append-only array.
 *
 * Ownership notes:
 *   - Contains the userId of the actor who triggered the transition.
 *     This is internal staff data; not exposed to applicants.
 *   - The array is append-only — entries must never be removed or overwritten.
 *     Deletions would destroy the audit trail and may violate compliance
 *     obligations.
 */
@Schema({ _id: false })
export class ProgramStatusHistoryEntry {
  @Prop({
    required: true,
    enum: ScholarshipProgramStatus,
  })
  status: ScholarshipProgramStatus;

  /** User id (JWT `sub`) of the staff member who triggered the transition. */
  @Prop({ required: true })
  changedBy: string;

  @Prop({ required: true })
  changedAt: Date;
}

export const ProgramStatusHistoryEntrySchema = SchemaFactory.createForClass(
  ProgramStatusHistoryEntry,
);

/**
 * Describes one field on a program's application form.
 *
 * Ownership notes:
 *   - Form definitions are created by organization staff and scoped to
 *     `organizationId`.  Applicants may read them to render the form.
 *   - `wordLimit` is the authoritative server-side cap applied during answer
 *     validation; it must match whatever the client UI displays.
 *   - `required` determines whether a missing answer is rejected.
 */
@Schema({ _id: true })
export class ProgramFormField {
  /** Auto-generated ObjectId used as the stable reference in `ApplicationAnswer.fieldId`. */
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true })
  description?: string;

  /**
   * Maximum number of words permitted for this field's answer.
   * `null` means no limit beyond the system default (DEFAULT_ANSWER_WORD_LIMIT).
   */
  @Prop({ min: 1, default: null })
  wordLimit: number | null;

  /** When true the applicant must supply a non-empty answer. */
  @Prop({ required: true, default: false })
  required: boolean;
}

export const ProgramFormFieldSchema =
  SchemaFactory.createForClass(ProgramFormField);

@Schema({ timestamps: true, collection: 'scholarship_programs' })
export class ScholarshipProgram {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    required: true,
    enum: ScholarshipProgramStatus,
    default: ScholarshipProgramStatus.DRAFT,
    index: true,
  })
  status: ScholarshipProgramStatus;

  @Prop({ type: Types.ObjectId, ref: 'ProgramTermsVersion', default: null })
  currentTermsVersionId?: Types.ObjectId | null;

  @Prop({ default: 0 })
  currentTermsVersionNumber: number;

  /** Application form fields with per-field word limits. */
  @Prop({ type: [ProgramFormFieldSchema], default: [] })
  formFields: ProgramFormField[];

  // ── Lifecycle audit fields (issue #1122) ─────────────────────────────────

  /**
   * Timestamp of the most recent status change.
   * Null for programs that have never had their status changed after creation.
   */
  @Prop({ default: null })
  statusChangedAt: Date | null;

  /**
   * User id (JWT `sub`) of the actor who last changed the status.
   * Null for programs that have never had their status changed.
   */
  @Prop({ default: null })
  statusChangedBy: string | null;

  /**
   * Append-only audit trail of all status transitions.
   * Each entry records the new status, who triggered it, and when.
   *
   * Operational impact:
   *   - This array grows unboundedly; programs with many state changes will
   *     have larger documents.  For programs with many pauses/resumes, consider
   *     periodic archival of the history to a separate collection.
   */
  @Prop({ type: [ProgramStatusHistoryEntrySchema], default: [] })
  statusHistory: ProgramStatusHistoryEntry[];

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipProgramSchema =
  SchemaFactory.createForClass(ScholarshipProgram);
ScholarshipProgramSchema.index({ organizationId: 1, status: 1 });
ScholarshipProgramSchema.index({ organizationId: 1, title: 1 });
