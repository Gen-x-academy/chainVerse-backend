import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProgramPrerequisiteDocument = HydratedDocument<ProgramPrerequisite>;

/**
 * Types of prerequisite achievement or status required before applying.
 *
 * Each type references an external entity via `referenceId`:
 *   ACHIEVEMENT       – platform badge/achievement ID
 *   COURSE_COMPLETION – course ID that must be completed
 *   SCHOLARSHIP_AWARD – prior scholarship program ID (applicant must hold an award)
 *   ENROLLMENT_STATUS – enrollment record ID or status code
 */
export enum PrerequisiteType {
  ACHIEVEMENT = 'achievement',
  COURSE_COMPLETION = 'course_completion',
  SCHOLARSHIP_AWARD = 'scholarship_award',
  ENROLLMENT_STATUS = 'enrollment_status',
}

/**
 * A prerequisite that applicants must meet before their application is accepted.
 *
 * Privacy:
 *   - `referenceId` is an opaque external identifier; no PII is stored here.
 *
 * Migration:
 *   - New collection `scholarship_program_prerequisites`. No existing data affected.
 */
@Schema({ timestamps: true, collection: 'scholarship_program_prerequisites' })
export class ProgramPrerequisite {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, enum: PrerequisiteType })
  prerequisiteType: PrerequisiteType;

  /**
   * Opaque reference to the external entity (achievement ID, course ID, etc.)
   * that the applicant must satisfy.
   */
  @Prop({ required: true, trim: true })
  referenceId: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  /**
   * When true, failing this prerequisite hard-blocks the application.
   * Advisory prerequisites (false) are surfaced as warnings only.
   */
  @Prop({ required: true, default: true })
  isRequired: boolean;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProgramPrerequisiteSchema =
  SchemaFactory.createForClass(ProgramPrerequisite);

ProgramPrerequisiteSchema.index(
  { programId: 1, prerequisiteType: 1, referenceId: 1 },
  { unique: true },
);
ProgramPrerequisiteSchema.index({ organizationId: 1, programId: 1 });
