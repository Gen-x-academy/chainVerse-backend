import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CapacityScope } from '../capacity.constants';

export type CapacityPolicyDocument = HydratedDocument<CapacityPolicy>;

/**
 * An immutable, versioned capacity policy for a scope (global, program or a
 * single mentor). Publishing is idempotent: identical content returns the
 * current version instead of creating a new one. Policies are never edited in
 * place — a change is a new version, so historical calculations stay explainable.
 *
 * A pause is read at evaluation time and may carry an expiry, after which it
 * stops applying without a background job.
 */
@Schema({ collection: 'mentorship_capacity_policies', timestamps: true })
export class CapacityPolicy {
  @Prop({ required: true, index: true })
  scopeKey: string;

  @Prop({ required: true, enum: Object.values(CapacityScope) })
  scope: CapacityScope;

  /** Program or mentor id; `null` for the global scope. */
  @Prop({ type: String, default: null })
  targetId: string | null;

  @Prop({ required: true, type: Number })
  version: number;

  /** Hash of the limit set; makes publishing idempotent. */
  @Prop({ required: true })
  contentHash: string;

  @Prop({ required: true, type: Number })
  maxConcurrentEngagements: number;

  @Prop({ required: true, type: Number })
  maxWeeklyHours: number;

  @Prop({ required: true, type: Number })
  maxPrograms: number;

  @Prop({ required: true, type: Number })
  maxCohortsPerProgram: number;

  /** Reserved (not yet activated) proposal slots on top of active engagements. */
  @Prop({ required: true, type: Number })
  reservedProposalCapacity: number;

  @Prop({ default: false })
  paused: boolean;

  @Prop({ type: String, default: null, maxlength: 500 })
  pauseReason: string | null;

  @Prop({ type: Date, default: null })
  pauseExpiresAt: Date | null;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CapacityPolicySchema = SchemaFactory.createForClass(CapacityPolicy);

CapacityPolicySchema.index({ scopeKey: 1, version: 1 }, { unique: true });
