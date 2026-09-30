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
  @Prop({ type: Number, min: 1, default: null })
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
  @Prop({ type: Date, default: null })
  statusChangedAt: Date | null;

  /**
   * User id (JWT `sub`) of the actor who last changed the status.
   * Null for programs that have never had their status changed.
   */
  @Prop({ type: String, default: null })
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

  // ── Denormalized search projection (#1175) ───────────────────────────────
  //
  // The catalog is a read model: it exists so students and staff can find
  // programs without joining `program_terms_versions`. Award value, currency
  // and deadline all live on the terms revision, so filtering on them would
  // otherwise require an aggregation with a $lookup on every search request.
  //
  // These fields are written by `publishTerms` whenever a revision becomes
  // current, so they always describe the *currently published* terms. They are
  // never written by a client and never read as the source of truth — the terms
  // revision remains authoritative, and these are a projection of it.

  /** Award value of the currently published terms, or 0 when none is published. */
  @Prop({ default: 0, index: true })
  awardValue: number;

  /** Currency of `awardValue`, or null when no terms are published. */
  @Prop({ type: String, default: null })
  awardCurrency: string | null;

  /**
   * Application deadline of the currently published terms, or null.
   * Sourced from the first present of `closesAt`, `applicationDeadline`,
   * `dueAt`, `deadline`.
   */
  @Prop({ type: Date, default: null, index: true })
  applicationDeadline: Date | null;

  /**
   * How the program is funded. Drives the `fundingType` catalog filter and is
   * the field the finance context uses to decide whether a payout can be
   * settled on-chain.
   */
  @Prop({
    default: 'manual',
    enum: ['horizon', 'manual', 'deposit'],
    index: true,
  })
  fundingType: 'horizon' | 'manual' | 'deposit';

  /** Stellar network the program pays out on. */
  @Prop({
    default: 'testnet',
    enum: ['testnet', 'public'],
    index: true,
  })
  network: 'testnet' | 'public';

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipProgramSchema =
  SchemaFactory.createForClass(ScholarshipProgram);
ScholarshipProgramSchema.index({ organizationId: 1, status: 1 });
ScholarshipProgramSchema.index({ organizationId: 1, title: 1 });
// Catalog search (#1175): the two compound indexes that cover the filtered
// listing. `{status, awardValue}` serves the award-range filter and
// `{organizationId, applicationDeadline}` serves "closing soon" queries.
ScholarshipProgramSchema.index({
  organizationId: 1,
  status: 1,
  awardValue: -1,
});
ScholarshipProgramSchema.index({ organizationId: 1, applicationDeadline: 1 });
