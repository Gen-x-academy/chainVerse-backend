import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { HoldStatus } from '../enums/hold-status.enum';
import { HoldPriority } from '../enums/hold-priority.enum';

export type LibraryHoldDocument = HydratedDocument<LibraryHold>;

@Schema({ timestamps: true })
export class LibraryHold {
  @Prop({ required: true })
  bookId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userRole: string;

  @Prop({ required: true, enum: HoldStatus, default: HoldStatus.ACTIVE })
  status: HoldStatus;

  @Prop({ required: true, enum: HoldPriority, default: HoldPriority.NORMAL })
  priority: HoldPriority;

  @Prop({ required: true, default: 0 })
  priorityRank: number;

  @Prop({ default: null })
  priorityReason?: string | null;

  @Prop({ required: true })
  placedAt: Date;

  @Prop({ default: null })
  assignedCopyId?: string | null;

  @Prop({ default: null })
  readyAt?: Date | null;

  @Prop({ default: null })
  pickupExpiresAt?: Date | null;

  @Prop({ default: null })
  fulfilledAt?: Date | null;

  @Prop({ default: null })
  expiredAt?: Date | null;

  @Prop({ default: null })
  cancelledAt?: Date | null;

  @Prop({ default: null })
  cancelledBy?: string | null;

  @Prop({ default: null })
  cancelledByRole?: string | null;

  @Prop({ default: null })
  cancelReason?: string | null;
}

export const LibraryHoldSchema = SchemaFactory.createForClass(LibraryHold);

// One active/ready hold per user per book — the DB is the source of truth
// for duplicate prevention and idempotent placement, not an app-level check.
LibraryHoldSchema.index(
  { bookId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [HoldStatus.ACTIVE, HoldStatus.READY] },
    },
  },
);

// Queue ordering: highest priorityRank first, ties broken by insertion order.
LibraryHoldSchema.index({ bookId: 1, status: 1, priorityRank: -1, _id: 1 });

LibraryHoldSchema.index({ userId: 1, status: 1 });

// Pickup-window expiration sweep.
LibraryHoldSchema.index({ status: 1, pickupExpiresAt: 1 });
