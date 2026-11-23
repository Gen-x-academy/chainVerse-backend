import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum SponsorshipStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}
export enum ReservationStatus {
  RESERVED = 'reserved',
  RELEASED = 'released',
  SETTLED = 'settled',
}

@Schema({ timestamps: true, collection: 'mentorship_sponsorships' })
export class MentorshipSponsorship {
  @Prop({ required: true, index: true }) sponsorId!: string;
  @Prop({ required: true }) programId!: string;
  @Prop({ required: true }) currency!: string;
  @Prop({ required: true }) totalBudget!: number;
  @Prop({ required: true, default: 0 }) reservedAmount!: number;
  @Prop({ required: true, default: 0 }) spentAmount!: number;
  @Prop({
    required: true,
    enum: SponsorshipStatus,
    default: SponsorshipStatus.ACTIVE,
  })
  status!: SponsorshipStatus;
}
export type MentorshipSponsorshipDocument =
  HydratedDocument<MentorshipSponsorship>;
export const MentorshipSponsorshipSchema = SchemaFactory.createForClass(
  MentorshipSponsorship,
);

@Schema({ timestamps: true, collection: 'mentorship_sponsorship_reservations' })
export class SponsorshipReservation {
  @Prop({ required: true, index: true }) sponsorshipId!: string;
  @Prop({ required: true }) engagementId!: string;
  @Prop({ required: true }) amount!: number;
  @Prop({
    required: true,
    enum: ReservationStatus,
    default: ReservationStatus.RESERVED,
  })
  status!: ReservationStatus;
  @Prop({ required: true }) idempotencyKey!: string;
}
export type SponsorshipReservationDocument =
  HydratedDocument<SponsorshipReservation>;
export const SponsorshipReservationSchema = SchemaFactory.createForClass(
  SponsorshipReservation,
);
SponsorshipReservationSchema.index(
  { sponsorshipId: 1, idempotencyKey: 1 },
  { unique: true },
);
