import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class WeeklyWindow {
  @Prop({ required: true, min: 0, max: 6 })
  dayOfWeek!: number;

  @Prop({ required: true, min: 0, max: 1439 })
  startMinute!: number;

  @Prop({ required: true, min: 1, max: 1440 })
  endMinute!: number;
}

@Schema({ _id: false })
export class AvailabilityException {
  @Prop({ required: true })
  date!: string; // YYYY-MM-DD

  @Prop({ required: true })
  available!: boolean;

  @Prop({ type: Number, default: null })
  startMinute!: number | null;

  @Prop({ type: Number, default: null })
  endMinute!: number | null;
}

@Schema({ timestamps: true, collection: 'mentor_availability_schedules' })
export class MentorAvailabilitySchedule {
  @Prop({ required: true, unique: true, index: true })
  mentorId!: string;

  @Prop({ required: true })
  timeZone!: string;

  @Prop({ required: true, min: 0, max: 10080 })
  leadTimeMinutes!: number;

  @Prop({ required: true, min: 0, max: 240 })
  bufferMinutes!: number;

  @Prop({ required: true, min: 1, max: 365 })
  bookingHorizonDays!: number;

  @Prop({ type: Date, default: null })
  effectiveFrom!: Date | null;

  @Prop({ type: Date, default: null })
  effectiveTo!: Date | null;

  @Prop({ type: [Object], default: [] })
  weeklyWindows!: WeeklyWindow[];

  @Prop({ type: [Object], default: [] })
  exceptions!: AvailabilityException[];

  @Prop({ required: true })
  updatedBy!: string;
}

export type MentorAvailabilityScheduleDocument =
  HydratedDocument<MentorAvailabilitySchedule>;
export const MentorAvailabilityScheduleSchema = SchemaFactory.createForClass(
  MentorAvailabilitySchedule,
);
