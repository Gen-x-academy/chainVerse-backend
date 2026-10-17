import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class FormQuestion {
  /** Stable key used as the answer field name (`answers.<key>`). */
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: false })
  required: boolean;

  @Prop({ default: 2000 })
  maxLength: number;
}

export const FormQuestionSchema = SchemaFactory.createForClass(FormQuestion);

export type MentorshipApplicationFormDocument =
  HydratedDocument<MentorshipApplicationForm>;

/**
 * A versioned set of program questions. Exactly one version per program is
 * `isCurrent`; that is the "accepted form version" applications must be
 * submitted against. Older versions are kept so in-flight drafts can still be
 * read and rebased.
 */
@Schema({ timestamps: true, collection: 'mentorship_application_forms' })
export class MentorshipApplicationForm {
  @Prop({ required: true })
  programId: string;

  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({ type: [FormQuestionSchema], default: [] })
  questions: FormQuestion[];

  /** Consent text version mentees must accept on this form version. */
  @Prop({ required: true })
  consentVersion: string;

  @Prop({ default: false })
  isCurrent: boolean;

  @Prop({ required: true })
  publishedBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipApplicationFormSchema = SchemaFactory.createForClass(
  MentorshipApplicationForm,
);

MentorshipApplicationFormSchema.index(
  { programId: 1, version: 1 },
  { unique: true },
);
MentorshipApplicationFormSchema.index(
  { programId: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } },
);
