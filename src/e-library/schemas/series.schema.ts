import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SeriesDocument = HydratedDocument<Series>;

@Schema({ timestamps: true, collection: 'library_series' })
export class Series {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SeriesSchema = SchemaFactory.createForClass(Series);
