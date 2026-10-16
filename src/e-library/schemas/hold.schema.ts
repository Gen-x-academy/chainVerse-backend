import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HoldDocument = HydratedDocument<Hold>;

export enum HoldStatus {
  PENDING = 'pending',
  READY = 'ready',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/** Hold statuses that count against a patron's active-hold limit. */
export const ACTIVE_HOLD_STATUSES = [HoldStatus.PENDING, HoldStatus.READY];

@Schema({ timestamps: true, collection: 'library_holds' })
export class Hold {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Book', index: true })
  bookId: Types.ObjectId;

  @Prop({ required: true, index: true })
  workKey: string;

  @Prop({
    required: true,
    enum: HoldStatus,
    default: HoldStatus.PENDING,
  })
  status: HoldStatus;

  @Prop({ required: true, default: Date.now })
  requestedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HoldSchema = SchemaFactory.createForClass(Hold);

// Enforces "one active hold per patron per exact edition" atomically at the
// database layer, independent of the application-level checks in HoldsService.
HoldSchema.index(
  { patronId: 1, bookId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ACTIVE_HOLD_STATUSES },
    },
  },
);

HoldSchema.index({ bookId: 1, status: 1, requestedAt: 1 });
