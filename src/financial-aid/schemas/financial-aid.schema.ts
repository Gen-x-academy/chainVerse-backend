import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FinancialAidDocument = HydratedDocument<FinancialAid>;

@Schema({ timestamps: true })
export class FinancialAid {
  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true })
  courseId: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: 'pending' })
  status: string;
}

export const FinancialAidSchema = SchemaFactory.createForClass(FinancialAid);
