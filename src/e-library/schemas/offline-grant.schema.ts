import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OfflineGrantDocument = HydratedDocument<OfflineGrant>;

export enum OfflineGrantStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'library_offline_grants' })
export class OfflineGrant {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'DigitalLoan', index: true })
  loanId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  editionId: string;

  @Prop({ required: true, trim: true, index: true })
  renditionId: string;

  @Prop({ required: true, trim: true })
  deviceIdHash: string;

  @Prop({ required: true, min: 1, default: 1 })
  allowedDeviceCount: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, enum: OfflineGrantStatus, default: OfflineGrantStatus.ACTIVE, index: true })
  status: OfflineGrantStatus;

  @Prop({ trim: true, unique: true })
  grantToken?: string;

  @Prop()
  revokedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OfflineGrantSchema = SchemaFactory.createForClass(OfflineGrant);
OfflineGrantSchema.index(
  {
    patronId: 1,
    loanId: 1,
    renditionId: 1,
    deviceIdHash: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: OfflineGrantStatus.ACTIVE },
  },
);
OfflineGrantSchema.index({ patronId: 1, status: 1, expiresAt: 1 });