import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LibraryPolicyDocument = HydratedDocument<LibraryPolicy>;

/** Singleton scope key — there is exactly one active policy document. */
export const GLOBAL_LIBRARY_POLICY_SCOPE = 'global';

/**
 * Policy-driven configuration for holds, loans, and renewals. `version` is
 * bumped on every update so renewal/auto-renewal audit trails can record
 * which policy was in effect at the time.
 */
@Schema({ timestamps: true, collection: 'library_policies' })
export class LibraryPolicy {
  @Prop({ required: true, unique: true, default: GLOBAL_LIBRARY_POLICY_SCOPE })
  scope: string;

  @Prop({ required: true, min: 1, default: 5 })
  maxActiveHolds: number;

  @Prop({ required: true, default: false })
  allowMultipleEditionsPerWork: boolean;

  @Prop({ required: true, min: 1, default: 14 })
  loanPeriodDays: number;

  @Prop({ required: true, min: 0, default: 2 })
  maxRenewals: number;

  @Prop({ required: true, min: 1, default: 14 })
  renewalExtensionDays: number;

  @Prop({ required: true, min: 1, default: 3 })
  holdExpiryDays: number;

  @Prop({ required: true, min: 0, default: 2 })
  autoRenewalLeadDays: number;

  @Prop({ required: true, default: 1 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LibraryPolicySchema = SchemaFactory.createForClass(LibraryPolicy);
