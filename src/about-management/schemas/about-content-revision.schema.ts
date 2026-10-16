import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum RevisionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true, collection: 'about_content_revisions' })
export class AboutContentRevision {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: RevisionStatus, default: RevisionStatus.DRAFT, required: true })
  status: RevisionStatus;

  @Prop({ required: true })
  author: string;

  @Prop({ required: true })
  version: number;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ default: '' })
  preview: string;
}

export type AboutContentRevisionDocument =
  HydratedDocument<AboutContentRevision>;
export const AboutContentRevisionSchema =
  SchemaFactory.createForClass(AboutContentRevision);
