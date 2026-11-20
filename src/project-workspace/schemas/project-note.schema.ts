import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectNoteDocument = HydratedDocument<ProjectNote>;

export enum NoteStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({ _id: false })
export class NoteRevision {
  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ required: true })
  editorId!: string;

  @Prop({ type: Date, default: () => new Date() })
  at!: Date;
}

export const NoteRevisionSchema = SchemaFactory.createForClass(NoteRevision);

/**
 * Team-visible note. `source` is the author's markdown and `content` is its
 * escaped, safe-rendered form. Private researcher notes live in a separate
 * encrypted collection and are never written here.
 */
@Schema({ timestamps: true, collection: 'project_notes' })
export class ProjectNote {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  projectId!: string;

  @Prop({ required: true, index: true })
  authorId!: string;

  @Prop({ required: true })
  lastEditorId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  source!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({
    required: true,
    enum: NoteStatus,
    default: NoteStatus.DRAFT,
    index: true,
  })
  status!: NoteStatus;

  @Prop({ type: [String], default: [] })
  linkedNoteIds!: string[];

  @Prop({ type: [NoteRevisionSchema], default: [] })
  revisions!: NoteRevision[];

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ type: String, default: null })
  idempotencyKey!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectNoteSchema = SchemaFactory.createForClass(ProjectNote);
ProjectNoteSchema.index({ tenantId: 1, projectId: 1, status: 1 });
ProjectNoteSchema.index(
  { tenantId: 1, projectId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
