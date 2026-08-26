import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClosureCalendarDocument = HydratedDocument<ClosureCalendar>;

@Schema({ timestamps: true, collection: 'library_closure_calendar' })
export class ClosureCalendar {
  @Prop({ required: true, index: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ default: true })
  extendsPickupWindows: boolean;

  @Prop({ default: false })
  blocksDueDates: boolean;

  @Prop({ trim: true })
  createdBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ClosureCalendarSchema =
  SchemaFactory.createForClass(ClosureCalendar);
ClosureCalendarSchema.index({ startDate: 1, endDate: 1 });
