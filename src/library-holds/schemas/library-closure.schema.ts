import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LibraryClosureDocument = HydratedDocument<LibraryClosure>;

@Schema({ timestamps: true })
export class LibraryClosure {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, trim: true })
  reason: string;
}

export const LibraryClosureSchema =
  SchemaFactory.createForClass(LibraryClosure);

LibraryClosureSchema.index({ date: 1 }, { unique: true });
