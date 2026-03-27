import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TutorDocument = HydratedDocument<Tutor>;

@Schema({ timestamps: true })
export class Tutor {
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

  @Prop({ type: String, default: null })
  resetToken: string | null;

  @Prop({ type: Number, default: null })
  resetTokenExpiry: number | null;

  @Prop({ default: 'tutor' })
  role: string;

  // Profile fields
  @Prop({ default: null })
  bio?: string | null;

  @Prop({ default: null })
  profileImageUrl?: string | null;

  @Prop({ type: [String], default: [] })
  specializations: string[];

  @Prop({ default: null })
  qualifications?: string | null;

  @Prop({ default: 0 })
  yearsOfExperience: number;

  @Prop({ default: null })
  linkedinUrl?: string | null;

  @Prop({ default: null })
  websiteUrl?: string | null;

  // Account status
  @Prop({ default: 'pending' })
  accountStatus: 'pending' | 'active' | 'suspended' | 'deactivated';

  @Prop({ type: Date, default: null })
  suspendedAt?: Date | null;

  @Prop({ type: String, default: null })
  suspensionReason?: string | null;

  // Statistics (denormalized for performance)
  @Prop({ default: 0 })
  totalCourses: number;

  @Prop({ default: 0 })
  totalStudents: number;

  @Prop({ default: 0 })
  averageRating: number;

  @Prop({ default: 0 })
  totalReviews: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorSchema = SchemaFactory.createForClass(Tutor);

// Index for efficient lookups
TutorSchema.index({ email: 1 });
TutorSchema.index({ accountStatus: 1 });
