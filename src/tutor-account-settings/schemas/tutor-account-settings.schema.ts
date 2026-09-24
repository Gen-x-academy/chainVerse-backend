import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TutorAccountSettingsDocument =
  HydratedDocument<TutorAccountSettings>;

@Schema({ timestamps: true, collection: 'tutor_account_settings' })
export class TutorAccountSettings {
  @Prop({ required: true, unique: true, index: true })
  tutorId: string;

  @Prop({ type: String, default: null, maxlength: 100 })
  displayName: string | null;

  @Prop({ default: 'en', maxlength: 10 })
  language: string;

  @Prop({ default: 'UTC', maxlength: 64 })
  timezone: string;

  @Prop({ default: true })
  emailNotifications: boolean;

  @Prop({ default: false })
  newCourseEnrollmentNotifications: boolean;

  @Prop({ default: true })
  studentMessageNotifications: boolean;

  @Prop({ default: true })
  reviewNotifications: boolean;

  @Prop({
    type: String,
    default: 'available',
    enum: ['available', 'busy', 'unavailable'],
  })
  availabilityStatus: 'available' | 'busy' | 'unavailable';

  @Prop({ type: String, default: 'private', enum: ['public', 'private'] })
  profileVisibility: 'public' | 'private';

  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorAccountSettingsSchema = SchemaFactory.createForClass(
  TutorAccountSettings,
);
