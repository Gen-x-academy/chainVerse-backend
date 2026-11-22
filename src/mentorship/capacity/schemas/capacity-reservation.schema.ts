import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReservationStatus } from '../capacity.constants';

export type CapacityReservationDocument = HydratedDocument<CapacityReservation>;

/**
 * One proposal's slot reservation. A row is created once and only ever moves
 * from `active` to a terminal state via a conditional update, so releasing or
 * expiring is idempotent. The unique (mentor, proposal) key makes retries
 * return the same row instead of holding multiple slots.
 */
@Schema({ collection: 'mentorship_capacity_reservations', timestamps: true })
export class CapacityReservation {
  @Prop({ required: true, index: true })
  mentorId: string;

  @Prop({ required: true, index: true })
  proposalId: string;

  @Prop({ required: true })
  scopeKey: string;

  @Prop({ required: true, type: Number })
  policyVersion: number;

  @Prop({ required: true })
  idempotencyKey: string;

  /** Fingerprint of the reservation inputs; detects key reuse with new content. */
  @Prop({ required: true })
  fingerprint: string;

  @Prop({
    required: true,
    enum: Object.values(ReservationStatus),
    default: ReservationStatus.ACTIVE,
  })
  status: ReservationStatus;

  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  releasedAt: Date | null;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CapacityReservationSchema = SchemaFactory.createForClass(CapacityReservation);

CapacityReservationSchema.index({ mentorId: 1, proposalId: 1 }, { unique: true });
CapacityReservationSchema.index({ status: 1, expiresAt: 1 });
