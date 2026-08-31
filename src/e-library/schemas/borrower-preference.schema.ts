import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BorrowerPreferenceDocument = HydratedDocument<BorrowerPreference>;

@Schema({ timestamps: true, collection: 'library_borrower_preferences' })
export class BorrowerPreference {
  @Prop({ required: true, unique: true, index: true })
  patronId: string;

  @Prop({ default: true })
  emailReminders: boolean;

  @Prop({ default: true })
  inAppReminders: boolean;

  @Prop({ default: null, type: String })
  quietHoursStart: string | null;

  @Prop({ default: null, type: String })
  quietHoursEnd: string | null;

  @Prop({ default: 'en' })
  locale: string;

  @Prop({ default: 'UTC' })
  timezone: string;

  @Prop({ default: false })
  optOutMandatoryNotices: boolean;

  @Prop({ default: false })
  optOutRecommendations: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BorrowerPreferenceSchema =
  SchemaFactory.createForClass(BorrowerPreference);
BorrowerPreferenceSchema.index({ patronId: 1 }, { unique: true });
