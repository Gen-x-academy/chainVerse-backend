import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProgramTermsVersionDocument =
  HydratedDocument<ProgramTermsVersion>;

export enum TermsVersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  SUPERSEDED = 'superseded',
}

@Schema({ timestamps: true, collection: 'scholarship_program_terms_versions' })
export class ProgramTermsVersion {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, immutable: true })
  versionNumber: number;

  @Prop({
    required: true,
    enum: TermsVersionStatus,
    default: TermsVersionStatus.DRAFT,
    index: true,
  })
  status: TermsVersionStatus;

  @Prop({ type: Object, required: true, immutable: true })
  eligibility: Record<string, unknown>;

  @Prop({ type: Object, required: true, immutable: true })
  deadlines: Record<string, unknown>;

  @Prop({ required: true, min: 0, immutable: true })
  awardValue: number;

  @Prop({ trim: true, immutable: true })
  awardCurrency?: string;

  @Prop({ type: [String], default: [], immutable: true })
  obligations: string[];

  @Prop()
  publishedAt?: Date;

  @Prop()
  publishedBy?: string;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProgramTermsVersionSchema =
  SchemaFactory.createForClass(ProgramTermsVersion);
ProgramTermsVersionSchema.index(
  { programId: 1, versionNumber: 1 },
  { unique: true },
);
ProgramTermsVersionSchema.index({ programId: 1, status: 1 });