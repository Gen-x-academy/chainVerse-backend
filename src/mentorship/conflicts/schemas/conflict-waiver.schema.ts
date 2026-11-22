import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WaiverStatus } from '../conflict.constants';

export type ConflictWaiverDocument = HydratedDocument<ConflictWaiver>;

/**
 * Append-only waiver decision for one hard finding (MENTOR-040).
 *
 * A request is one version; approval/rejection is a separate, later version
 * written by a different authorized actor. Nothing is ever edited in place:
 * the full chain stays available to explain why activation was allowed.
 */
@Schema({ collection: 'mentorship_conflict_waivers', timestamps: true })
export class ConflictWaiver {
  @Prop({ required: true, index: true })
  proposalId: string;

  @Prop({ required: true, index: true })
  checkId: string;

  @Prop({ required: true, index: true })
  findingCode: string;

  @Prop({ required: true, type: Number })
  version: number;

  @Prop({ required: true, enum: Object.values(WaiverStatus) })
  status: WaiverStatus;

  /** Fingerprint of the request input; retries never create a second request. */
  @Prop({ required: true })
  fingerprint: string;

  /** Private to staff: why the waiver was requested. */
  @Prop({ type: String, default: null, maxlength: 2000 })
  reason: string | null;

  /** Private to staff: the approver's note. */
  @Prop({ type: String, default: null, maxlength: 2000 })
  decisionNote: string | null;

  @Prop({ default: null })
  requestedBy: string | null;

  @Prop({ default: null })
  decidedBy: string | null;

  @Prop({ type: Date, default: null })
  decidedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConflictWaiverSchema = SchemaFactory.createForClass(ConflictWaiver);

ConflictWaiverSchema.index(
  { proposalId: 1, findingCode: 1, version: 1 },
  { unique: true },
);
ConflictWaiverSchema.index({ proposalId: 1, status: 1 });
