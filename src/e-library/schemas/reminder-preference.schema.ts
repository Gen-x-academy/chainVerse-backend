import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReminderPreferenceDocument = HydratedDocument<ReminderPreference>;

export enum ReminderChannel {
  EMAIL = 'email',
  IN_APP = 'in_app',
  BOTH = 'both',
}

@Schema({ _id: false })
export class QuietHours {
  @Prop({ required: true, min: 0, max: 23 })
  startHour: number;

  @Prop({ required: true, min: 0, max: 23 })
  endHour: number;

  @Prop({ type: String, default: 'UTC' })
  timezone: string;
}

export const QuietHoursSchema = SchemaFactory.createForClass(QuietHours);

@Schema({ timestamps: true, collection: 'library_reminder_preferences' })
export class ReminderPreference {
  @Prop({ required: true, unique: true, index: true })
  patronId: string;

  @Prop({
    required: true,
    type: [String],
    enum: ReminderChannel,
    default: [ReminderChannel.IN_APP],
  })
  channels: ReminderChannel[];

  @Prop({ type: QuietHoursSchema, default: null })
  quietHours: QuietHours | null;

  @Prop({ required: true, default: true })
  enabled: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReminderPreferenceSchema =
  SchemaFactory.createForClass(ReminderPreference);
ReminderPreferenceSchema.index({ patronId: 1 }, { unique: true });
