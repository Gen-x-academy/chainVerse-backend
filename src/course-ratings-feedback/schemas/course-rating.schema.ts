import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CourseRatingDocument = HydratedDocument<CourseRating>;

@Schema({ timestamps: true })
export class CourseRating {
  @Prop({ required: true })
  courseId: string;

  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop()
  feedback?: string;
}

export const CourseRatingSchema = SchemaFactory.createForClass(CourseRating);

CourseRatingSchema.index({ courseId: 1, studentId: 1 }, { unique: true });
