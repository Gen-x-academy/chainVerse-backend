import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type CourseCategorizationItemDocument =
  HydratedDocument<CourseCategorizationItem>;

@Schema({ timestamps: true, collection: 'course_categorization_items' })
export class CourseCategorizationItem {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop()
  description?: string;

  /** Free-form metadata; category, level and tags are used by search filters. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: undefined })
  metadata?: Record<string, unknown>;
}

export const CourseCategorizationItemSchema = SchemaFactory.createForClass(
  CourseCategorizationItem,
);

CourseCategorizationItemSchema.index({ 'metadata.category': 1 });
CourseCategorizationItemSchema.index({ 'metadata.level': 1 });
CourseCategorizationItemSchema.index({ 'metadata.tags': 1 });
