import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BorrowerLibraryPreferenceDocument =
  HydratedDocument<BorrowerLibraryPreference>;

@Schema({ timestamps: true })
export class BorrowerLibraryPreference {
  @Prop({ required: true, unique: true, index: true })
  patronId: string;

  /** Allow email reminders for due-soon and overdue notices. */
  @Prop({ default: true })
  emailRemindersEnabled: boolean;

  /** Allow in-app reminders for due-soon and overdue notices. */
  @Prop({ default: true })
  inAppRemindersEnabled: boolean;

  /**
   * Quiet-hour window start in 24-h local time (e.g. "22:00").
   * No reminder notifications are sent during the quiet window.
   */
  @Prop({ default: '22:00' })
  quietHoursStart: string;

  /** Quiet-hour window end in 24-h local time (e.g. "08:00"). */
  @Prop({ default: '08:00' })
  quietHoursEnd: string;

  /** IANA timezone identifier (e.g. "Africa/Lagos"). */
  @Prop({ default: 'UTC' })
  timezone: string;

  /** BCP-47 locale code (e.g. "en-NG"). */
  @Prop({ default: 'en' })
  locale: string;
}

export const BorrowerLibraryPreferenceSchema =
  SchemaFactory.createForClass(BorrowerLibraryPreference);