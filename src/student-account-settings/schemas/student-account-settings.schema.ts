import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StudentAccountSettingsDocument =
  HydratedDocument<StudentAccountSettings>;

/**
 * Per-student preferences.
 *
 * `studentId` is always the JWT subject of the student the row belongs to and
 * is never accepted from a request body, so a record cannot be created for, or
 * moved to, another account.
 */
@Schema({ timestamps: true, collection: 'student_account_settings' })
export class StudentAccountSettings {
  @Prop({ required: true, unique: true, index: true })
  studentId: string;

  @Prop({ type: String, default: null, maxlength: 100 })
  displayName: string | null;

  @Prop({ default: 'en', maxlength: 10 })
  language: string;

  @Prop({ default: 'UTC', maxlength: 64 })
  timezone: string;

  @Prop({ default: true })
  emailNotifications: boolean;

  @Prop({ default: false })
  marketingEmails: boolean;

  @Prop({ type: String, default: 'private', enum: ['public', 'private'] })
  profileVisibility: 'public' | 'private';

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentAccountSettingsSchema = SchemaFactory.createForClass(
  StudentAccountSettings,
);
