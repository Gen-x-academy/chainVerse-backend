import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApplicationFormDocument = HydratedDocument<ApplicationForm>;

/**
 * Lifecycle status of an application form.
 *
 * - DRAFT:     Form is being built; edits are allowed.
 * - PUBLISHED: Form is live; immutable — no further edits.
 * - ARCHIVED:  Form is retired; no new submissions accepted.
 */
export enum FormStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Field types supported in a configurable application form.
 */
export enum FieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  FILE = 'file',
  DATE = 'date',
  CONSENT = 'consent',
  REFERENCE = 'reference',
}

/**
 * Conditional visibility rule: this field is shown only when another
 * field (`conditionalOn.fieldId`) currently holds `conditionalOn.value`.
 */
@Schema({ _id: false })
export class ConditionalRule {
  @Prop({ required: true })
  fieldId: string;

  @Prop({ required: true })
  value: string;
}
export const ConditionalRuleSchema = SchemaFactory.createForClass(ConditionalRule);

/**
 * A single field within a form section.
 */
@Schema({ _id: false })
export class FormField {
  /** Client-generated or server-assigned UUID that uniquely identifies this field. */
  @Prop({ required: true })
  fieldId: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  label: string;

  @Prop({ required: true, enum: Object.values(FieldType) })
  type: FieldType;

  @Prop({ default: false })
  required: boolean;

  /** Valid options for SELECT / MULTISELECT fields. */
  @Prop({ type: [String] })
  options?: string[];

  /** Maximum character length for TEXT / TEXTAREA fields. */
  @Prop()
  maxLength?: number;

  /** Show this field only when the referenced field holds the specified value. */
  @Prop({ type: ConditionalRuleSchema })
  conditionalOn?: ConditionalRule;
}
export const FormFieldSchema = SchemaFactory.createForClass(FormField);

/**
 * A logical grouping of fields within a form.
 */
@Schema({ _id: false })
export class FormSection {
  /** UUID identifying this section; provided by the client or auto-generated. */
  @Prop({ required: true })
  sectionId: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  /** Zero-based display order. */
  @Prop({ required: true, min: 0 })
  order: number;

  @Prop({ type: [FormFieldSchema], default: [] })
  fields: FormField[];

  /** When true, at least one answer in this section is required for submission. */
  @Prop({ default: true })
  isRequired: boolean;
}
export const FormSectionSchema = SchemaFactory.createForClass(FormSection);

/**
 * A configurable application form attached to a scholarship programme.
 *
 * Lifecycle: DRAFT → PUBLISHED → ARCHIVED
 *
 * Immutability constraint: once a form transitions to PUBLISHED its `sections`
 * and `fields` cannot be modified.  Structural changes must be made by
 * archiving the current form and creating a new DRAFT.
 */
@Schema({
  timestamps: true,
  collection: 'scholarship_application_forms',
})
export class ApplicationForm {
  /** The scholarship programme this form belongs to. */
  @Prop({ required: true, index: true })
  programId: string;

  /** Tenant (organisation) that owns this form. */
  @Prop({ required: true, index: true })
  tenantId: string;

  /**
   * Monotonically increasing version number.
   * Incremented automatically when a form is published; answers carry the
   * version they were validated against for audit traceability.
   */
  @Prop({ required: true, default: 1 })
  version: number;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: [FormSectionSchema], required: true })
  sections: FormSection[];

  @Prop({
    required: true,
    enum: Object.values(FormStatus),
    default: FormStatus.DRAFT,
  })
  status: FormStatus;

  /** ISO timestamp set when the form first transitions to PUBLISHED. */
  @Prop()
  publishedAt?: Date;

  /** User ID of the admin who published the form. */
  @Prop()
  publishedBy?: string;

  /** User ID of the admin who created the form. */
  @Prop({ required: true })
  createdBy: string;
}

export const ApplicationFormSchema =
  SchemaFactory.createForClass(ApplicationForm);

// ── Compound indexes ─────────────────────────────────────────────────────────

/** Each (programme, version) combination must be unique. */
ApplicationFormSchema.index({ programId: 1, version: 1 }, { unique: true });

/** Efficiently list active / draft forms per tenant. */
ApplicationFormSchema.index({ tenantId: 1, status: 1 });
