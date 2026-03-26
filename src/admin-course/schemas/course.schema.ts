import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  thumbnailUrl: string;

  @Prop({ required: true })
  tutorId: string;

  @Prop({ required: true })
  tutorEmail: string;

  @Prop({
    default: 'draft',
    enum: ['draft', 'pending', 'approved', 'rejected', 'published', 'unpublished'],
  })
  status: string;

  @Prop({ type: [String], default: [] })
  enrolledStudents: string[];

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
applySoftDeleteSchema(CourseSchema);
