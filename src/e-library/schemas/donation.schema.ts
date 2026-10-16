import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DonationDocument = HydratedDocument<Donation>;

export enum DonationStatus {
  OFFERED = 'offered',
  ACCEPTED = 'accepted',
  CATALOGUED = 'catalogued',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'library_donations' })
export class Donation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Donor', index: true })
  donorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book' })
  bookId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  titles: string[];

  @Prop({ min: 0, default: 0 })
  quantity: number;

  @Prop({ trim: true })
  valuationNote?: string;

  @Prop({ trim: true })
  restrictions?: string;

  @Prop({ enum: DonationStatus, default: DonationStatus.OFFERED, index: true })
  status: DonationStatus;

  @Prop({ trim: true })
  receivedBy?: string;

  @Prop()
  receivedAt?: Date;

  @Prop({ type: [String], default: [] })
  provenanceNotes: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const DonationSchema = SchemaFactory.createForClass(Donation);
DonationSchema.index({ donorId: 1, status: 1 });
