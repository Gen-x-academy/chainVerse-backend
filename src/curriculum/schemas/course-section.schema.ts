import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseSectionDocument = HydratedDocument<CourseSection>;

/**
 * A curriculum section — the top level of a course outline.
 *
 * Sections carry their own `_id`, so a client can keep referring to a section
 * across reorders: position lives in `order`, identity never moves.
 */
@Schema({ timestamps: true, collection: 'course_sections' })
export class CourseSection {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: null, maxlength: 2000 })
  description: string | null;

  /** Zero-based position within the course. Unique per course. */
  @Prop({ required: true, min: 0 })
  order: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CourseSectionSchema = SchemaFactory.createForClass(CourseSection);

// One section per position per course. The unique index is what stops two
// concurrent writers from settling on the same slot; the reorder path works
// around it with a two-phase update rather than by relaxing it.
CourseSectionSchema.index({ courseId: 1, order: 1 }, { unique: true });
