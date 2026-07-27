import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type EnrollmentDocument = HydratedDocument<Enrollment>;

class LessonProgress {
  @Prop({ required: true })
  lessonIndex: number;

  @Prop({ default: false })
  completed: boolean;

  // `Date | null` is ambiguous to the metadata reflector, so the type is explicit.
  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const LessonProgressSchema =
  SchemaFactory.createForClass(LessonProgress);

@Schema({ timestamps: true })
export class Enrollment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  courseId: string;

  @Prop({
    required: true,
    enum: ['free', 'paid'],
  })
  type: string;

  @Prop({ default: 0 })
  amountPaid: number;

  @Prop({
    default: 'completed',
    enum: ['pending', 'completed', 'failed'],
  })
  status: string;

  @Prop({ type: String, default: null })
  transactionId?: string | null;

  @Prop({ type: [LessonProgressSchema], default: [] })
  lessons: LessonProgress[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);

// Prevent duplicate enrollments
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
