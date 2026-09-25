import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatronProfileDocument = HydratedDocument<PatronProfile>;

export enum PatronStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BLOCKED = 'blocked',
  EXPIRED = 'expired',
}

export enum PatronRole {
  STUDENT = 'student',
  TUTOR = 'tutor',
}

@Schema({ timestamps: true, collection: 'library_patron_profiles' })
export class PatronProfile {
  @Prop({ required: true, unique: true, index: true })
  platformUserId: string;

  @Prop({ required: true, enum: PatronRole, index: true })
  role: PatronRole;

  @Prop({ required: true, enum: PatronStatus, default: PatronStatus.ACTIVE, index: true })
  status: PatronStatus;

  @Prop({ trim: true })
  displayName?: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ min: 0, default: 0 })
  maxActiveLoansOverride?: number;

  @Prop({ min: 0, default: 0 })
  maxRenewalsOverride?: number;

  @Prop({ min: 0, default: 0 })
  loanPeriodDaysOverride?: number;

  @Prop({ min: 0, default: 0 })
  maxActiveHoldsOverride?: number;

  @Prop({ trim: true })
  policyNote?: string;

  @Prop()
  statusChangedAt?: Date;

  @Prop({ trim: true })
  statusChangedBy?: string;

  @Prop({ trim: true })
  statusReason?: string;

  @Prop({ trim: true })
  appealNote?: string;

  @Prop()
  statusExpiresAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PatronProfileSchema =
  SchemaFactory.createForClass(PatronProfile);
PatronProfileSchema.index({ platformUserId: 1 }, { unique: true });
PatronProfileSchema.index({ status: 1, role: 1 });
