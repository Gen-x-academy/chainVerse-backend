import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type HoldDocument = HydratedDocument<Hold>;

export enum HoldStatus {
  ACTIVE = 'active',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

/**
 * A patron's request to be notified/served next when an item becomes
 * available. Used to detect conflicts when staff extend a due date on an
 * item other patrons are waiting for (see due-date overrides).
 */
@Schema({ timestamps: true })
export class Hold {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'LibraryItem', required: true, index: true })
  itemId: string;

  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ enum: HoldStatus, required: true, default: HoldStatus.ACTIVE, index: true })
  status: HoldStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HoldSchema = SchemaFactory.createForClass(Hold);
