import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CapacityAllocationDocument = HydratedDocument<CapacityAllocation>;

/**
 * Live usage counters for one mentor in one policy scope.
 *
 * Every mutation is a conditional `findOneAndUpdate` guarded by `version`, so
 * concurrent reservations cannot both win a single slot and retries cannot
 * double-count. `version` is bumped on each successful change.
 */
@Schema({ collection: 'mentorship_capacity_allocations', timestamps: true })
export class CapacityAllocation {
  @Prop({ required: true, index: true })
  mentorId: string;

  @Prop({ required: true })
  scopeKey: string;

  /** Policy version the counters were last evaluated against. */
  @Prop({ required: true, type: Number })
  policyVersion: number;

  @Prop({ required: true, default: 0, type: Number })
  activeEngagements: number;

  @Prop({ required: true, default: 0, type: Number })
  reservedProposals: number;

  @Prop({ required: true, default: 0, type: Number })
  weeklyHours: number;

  @Prop({ type: [String], default: [] })
  programs: string[];

  @Prop({ type: Object, default: {} })
  cohortsByProgram: Record<string, number>;

  @Prop({ required: true, default: 0, type: Number })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CapacityAllocationSchema = SchemaFactory.createForClass(CapacityAllocation);

CapacityAllocationSchema.index({ mentorId: 1, scopeKey: 1 }, { unique: true });
