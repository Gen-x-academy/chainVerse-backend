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

  @Prop({ default: null })
  verificationToken: string | null;

  @Prop({ default: null })
  resetToken: string | null;

  @Prop({ default: null })
  resetTokenExpiry: number | null;

  @Prop({ default: 'student' })
  role: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
