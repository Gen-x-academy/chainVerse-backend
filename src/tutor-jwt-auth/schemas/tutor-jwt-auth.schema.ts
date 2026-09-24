import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TutorJwtAuthDocument = HydratedDocument<TutorJwtAuth>;

@Schema({ timestamps: true })
export class TutorJwtAuth {
  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const TutorJwtAuthSchema = SchemaFactory.createForClass(TutorJwtAuth);
