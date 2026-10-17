import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { QuestionDefinition } from '../domain/question.types';

export type ApplicationFormVersionDocument = HydratedDocument<ApplicationFormVersion>;

export const FORM_VERSION_STATUSES = ['draft', 'published'] as const;
export type FormVersionStatus = (typeof FORM_VERSION_STATUSES)[number];

/**
 * One version of a program's application form (MENTOR-032).
 *
 * - At most one `draft` per program (partial unique index).
 * - `published` versions are immutable and never deleted: query middleware
 *   below scopes every update to drafts and refuses deletes, so even a
 *   buggy caller cannot rewrite history that submitted applications use.
 */
@Schema({ collection: 'mentorship_form_versions', timestamps: true })
export class ApplicationFormVersion {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  programId: string;

  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({ required: true, enum: FORM_VERSION_STATUSES, default: 'draft' })
  status: FormVersionStatus;

  @Prop({ type: [Object], default: [] })
  questions: QuestionDefinition[];

  /** Increments on every draft edit; used for optimistic concurrency. */
  @Prop({ required: true, default: 0 })
  revision: number;

  @Prop({ required: true })
  contentHash: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: String, default: null })
  publishedBy: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApplicationFormVersionSchema = SchemaFactory.createForClass(ApplicationFormVersion);

ApplicationFormVersionSchema.index({ programId: 1, version: 1 }, { unique: true });
ApplicationFormVersionSchema.index(
  { programId: 1 },
  { unique: true, partialFilterExpression: { status: 'draft' }, name: 'one_draft_per_program' },
);

// Scope every query-level write/delete to drafts so published versions cannot be touched.
ApplicationFormVersionSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  { document: false, query: true },
  function () {
    this.where({ status: 'draft' });
  },
);
ApplicationFormVersionSchema.pre('save', function () {
  if (!this.isNew && this.get('status') === 'published' && !this.isModified('status')) {
    throw new Error('Published form versions are immutable');
  }
});
