import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class FaqManagement extends Document {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  order: number;
}

export type FaqManagementDocument = FaqManagement & Document;
export const FaqManagementSchema = SchemaFactory.createForClass(FaqManagement);
