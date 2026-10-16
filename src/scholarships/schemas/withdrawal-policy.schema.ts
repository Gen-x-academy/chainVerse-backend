import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WithdrawalPolicyDocument = HydratedDocument<WithdrawalPolicy>;

/**
 * Per-program withdrawal policy.
 *
 * Controls whether applicants may self-withdraw, within what time window,
 * and whether a confirmed award releases committed capacity back to the pool.
 *
 * There is at most ONE policy per program (unique index on programId).
 * If no policy document exists the service falls back to the permissive
 * DEFAULT_WITHDRAWAL_POLICY constants.
 *
 * Privacy / ownership:
 *   - Scoped to organizationId.  OWNER / ADMIN may create or update.
 *   - The policy is readable by all org members so applicants can understand
 *     whether withdrawal is available.
 *
 * Migration:
 *   - No existing data is affected; this is a new collection.
 */
@Schema({ timestamps: true, collection: 'scholarship_withdrawal_policies' })
export class WithdrawalPolicy {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', unique: true })
  programId: Types.ObjectId;

  /**
   * Whether applicants are permitted to self-withdraw.
   * Defaults to true (permissive).
   */
  @Prop({ required: true, default: true })
  selfWithdrawalAllowed: boolean;

  /**
   * Maximum hours after initial submission within which withdrawal is
   * permitted.  0 (zero) means there is no time limit.
   */
  @Prop({ required: true, min: 0, default: 0 })
  windowAfterSubmissionHours: number;

  /**
   * Whether the withdrawal request must include an explicit confirmation
   * flag.  Defaults to true; set to false for programmatic integrations.
   */
  @Prop({ required: true, default: true })
  requiresConfirmation: boolean;

  /**
   * When true, withdrawing from a SUBMITTED or UNDER_REVIEW application
   * releases any reserved budget capacity back to the pool.
   */
  @Prop({ required: true, default: true })
  releasesCapacityOnWithdrawal: boolean;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WithdrawalPolicySchema =
  SchemaFactory.createForClass(WithdrawalPolicy);
WithdrawalPolicySchema.index({ organizationId: 1, programId: 1 });

/** Fallback used when no explicit policy document exists for a program. */
export const DEFAULT_WITHDRAWAL_POLICY = {
  selfWithdrawalAllowed: true,
  windowAfterSubmissionHours: 0,
  requiresConfirmation: true,
  releasesCapacityOnWithdrawal: true,
} as const;
