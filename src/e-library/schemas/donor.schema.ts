import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DonorDocument = HydratedDocument<Donor>;

export enum AcknowledgmentStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DECLINED = 'declined',
}

@Schema({ timestamps: true, collection: 'library_donors' })
export class Donor {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  organization?: string;

  @Prop({ type: [String], default: [] })
  consentPreferences: string[];

  @Prop({ trim: true })
  acknowledgmentName?: string;

  @Prop({ default: false })
  allowPublicAcknowledgment: boolean;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ enum: AcknowledgmentStatus, default: AcknowledgmentStatus.PENDING })
  acknowledgmentStatus: AcknowledgmentStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DonorSchema = SchemaFactory.createForClass(Donor);
DonorSchema.index({ name: 1 });
