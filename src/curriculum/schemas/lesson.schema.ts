import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  CONTENT_UNIT_TYPES,
  ContentUnitType,
} from '../enums/content-type.enum';

export type LessonDocument = HydratedDocument<Lesson>;

/** An ordered piece of lesson content (a video, an article, a quiz, …). */
export class ContentUnit {
  type: ContentUnitType;
  title: string;
  order: number;
  url?: string | null;
  body?: string | null;
  durationMinutes?: number;
}

const ContentUnitSchemaDefinition = {
  type: { type: String, required: true, enum: CONTENT_UNIT_TYPES },
  title: { type: String, required: true, maxlength: 200 },
  order: { type: Number, required: true, min: 0 },
  url: { type: String, default: null },
  body: { type: String, default: null, maxlength: 20000 },
  durationMinutes: { type: Number, default: 0, min: 0 },
};

/**
 * A lesson inside a curriculum section.
 *
 * `courseId` is denormalized alongside `sectionId` so the reorder operation and
 * the ownership checks can scope every query to a single course without a join.
 */
@Schema({ timestamps: true, collection: 'lessons' })
export class Lesson {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sectionId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: null, maxlength: 2000 })
  description: string | null;

  /** Zero-based position within the owning section. Unique per section. */
  @Prop({ required: true, min: 0 })
  order: number;

  @Prop({ type: [ContentUnitSchemaDefinition], default: [] })
  contentUnits: ContentUnit[];

  @Prop({ default: 0, min: 0 })
  durationMinutes: number;

  @Prop({ default: false })
  isPreview: boolean;

  @Prop({ type: String, default: 'draft', enum: ['draft', 'published'] })
  status: 'draft' | 'published';

  createdAt?: Date;
  updatedAt?: Date;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);

// One lesson per position per section — the same guarantee sections get.
LessonSchema.index({ sectionId: 1, order: 1 }, { unique: true });
LessonSchema.index({ courseId: 1, sectionId: 1, order: 1 });
