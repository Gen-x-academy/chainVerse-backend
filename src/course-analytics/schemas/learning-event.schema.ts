
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class LearningEvent extends Document {
  @Prop({ required: true, index: true })
  eventId: string;

  @Prop({ required: true, index: true })
  eventName: string;

  @Prop({ required: true })
  schemaVersion: number;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;
}

export const LearningEventSchema = SchemaFactory.createForClass(LearningEvent);