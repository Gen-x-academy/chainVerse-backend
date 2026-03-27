import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type EnrollmentDocument = HydratedDocument<Enrollment>;

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

  createdAt?: Date;
  updatedAt?: Date;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);

// Prevent duplicate enrollments
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
