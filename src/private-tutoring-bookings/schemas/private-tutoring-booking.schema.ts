import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PrivateTutoringBookingDocument =
  HydratedDocument<PrivateTutoringBooking>;

@Schema({ timestamps: true })
export class PrivateTutoringBooking {
  @Prop({ required: true })
  title: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PrivateTutoringBookingSchema = SchemaFactory.createForClass(
  PrivateTutoringBooking,
);
