import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SavedCourseDocument = HydratedDocument<SavedCourse>;

@Schema({ timestamps: true })
export class SavedCourse {
  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true })
  courseId: string;
}

export const SavedCourseSchema = SchemaFactory.createForClass(SavedCourse);

SavedCourseSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
