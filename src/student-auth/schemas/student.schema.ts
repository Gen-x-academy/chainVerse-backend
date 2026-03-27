import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StudentDocument = HydratedDocument<Student>;

@Schema({ timestamps: true })
export class Student {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ type: String, default: null })
  verificationToken: string | null;

  @Prop({ type: Number, default: null })
  verificationTokenExpiry: number | null;

  @Prop({ type: Number, default: 0 })
  verificationAttempts: number;

  @Prop({ type: Number, default: null })
  lastVerificationAttempt: number | null;

  @Prop({ type: String, default: null })
  resetToken: string | null;

  @Prop({ type: Number, default: null })
  resetTokenExpiry: number | null;

  @Prop({ default: 'student' })
  role: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
