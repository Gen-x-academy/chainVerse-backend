import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LibraryLocationDocument = HydratedDocument<LibraryLocation>;

export enum LocationType {
  BRANCH = 'branch',
  ROOM = 'room',
  SHELF = 'shelf',
}

@Schema({ timestamps: true, collection: 'library_locations' })
export class LibraryLocation {
  @Prop({ required: true, enum: LocationType, index: true })
  type: LocationType;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'LibraryLocation' })
  parentId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ trim: true })
  description?: string;

  @Prop({ min: 0, default: 0 })
  sortOrder: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LibraryLocationSchema =
  SchemaFactory.createForClass(LibraryLocation);
LibraryLocationSchema.index({ type: 1, name: 1 });
LibraryLocationSchema.index({ parentId: 1 });
