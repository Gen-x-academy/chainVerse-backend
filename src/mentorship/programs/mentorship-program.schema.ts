import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum MentorshipProgramStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Schema({ _id: false })
export class MentorshipProgramConfig {
  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ type: Object, default: {} })
  schedule: Record<string, unknown>;

  @Prop({ min: 0, default: 0 })
  price: number;
}

export const MentorshipProgramConfigSchema = SchemaFactory.createForClass(
  MentorshipProgramConfig,
);

@Schema({ timestamps: true, collection: 'mentorship_programs' })
export class MentorshipProgram {
  @Prop({ required: true, index: true })
  mentorId: string;

  @Prop({ required: true, enum: MentorshipProgramStatus, index: true })
  status: MentorshipProgramStatus;

  @Prop({ type: MentorshipProgramConfigSchema, required: true })
  config: MentorshipProgramConfig;

  @Prop({ type: String, default: null, index: true })
  clonedFromProgramId: string | null;

  @Prop({ type: Date, default: null })
  archivedAt: Date | null;

  @Prop({ type: String, default: null })
  archivedBy: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type MentorshipProgramDocument = HydratedDocument<MentorshipProgram>;
export const MentorshipProgramSchema = SchemaFactory.createForClass(MentorshipProgram);
MentorshipProgramSchema.index({ mentorId: 1, status: 1 });
MentorshipProgramSchema.index({ clonedFromProgramId: 1 });
