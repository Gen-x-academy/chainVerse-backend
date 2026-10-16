import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SavedListDocument = HydratedDocument<SavedList>;

@Schema({ _id: false })
export class SavedListItem {
  @Prop({ required: true })
  bookId: string;

  @Prop({ required: true, default: Date.now })
  addedAt: Date;

  @Prop({ trim: true })
  note?: string;
}

export const SavedListItemSchema = SchemaFactory.createForClass(SavedListItem);

@Schema({ timestamps: true, collection: 'library_saved_lists' })
export class SavedList {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  isFavorite: boolean;

  @Prop({ type: [SavedListItemSchema], default: [] })
  items: SavedListItem[];

  @Prop({ min: 1, default: 1 })
  sortOrder: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SavedListSchema = SchemaFactory.createForClass(SavedList);
SavedListSchema.index({ patronId: 1, name: 1 }, { unique: true });
SavedListSchema.index({ patronId: 1, isFavorite: 1 });
