import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type AgreementAmendmentDocument = HydratedDocument<AgreementAmendment>;

export enum AmendmentStatus {
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ACTIVE = 'active',
}

export interface ApprovalEntry {
  approverId: string;
  approvedAt: Date;
}

export interface AmendmentImpact {
  cadenceChanged: boolean;
  scopeChanged: boolean;
  datesChanged: boolean;
  priceChanged: boolean;
  policiesChanged: boolean;
  priceDelta: number | null;
  affectedParticipants: number;
  requiresReapproval: boolean;
  summary: string;
}

/** Stable hash of the terms that would result from applying an amendment. */
export function computeAmendmentHash(
  base: Record<string, unknown>,
  changes: Record<string, unknown>,
): string {
  const merged: Record<string, unknown> = { ...base, ...changes };
  const canonical = JSON.stringify(merged, Object.keys(merged).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Append-only amendment history. Each document represents one proposed change
 * to an agreement. Old terms keep governing until an amendment is explicitly
 * activated; rejecting an amendment never mutates the underlying agreement.
 * Approval entries are appended (never rewritten) with a conditional push.
 */
@Schema({ timestamps: true, collection: 'mentorship_agreement_amendments' })
export class AgreementAmendment {
  @Prop({ required: true, index: true })
  agreementId: string;

  /** The version number this amendment would make current. */
  @Prop({ required: true })
  version: number;

  /** The version this amendment replaces once activated. */
  @Prop({ required: true })
  supersedes: number;

  @Prop({ required: true, index: true })
  proposedBy: string;

  @Prop({ required: true, type: [String] })
  participantIds: string[];

  /** Requested changes: cadence, scope, dates, price and/or policies. */
  @Prop({ required: true, type: Object })
  changes: Record<string, unknown>;

  @Prop({ required: true })
  termsHash: string;

  @Prop({ required: true, type: Object })
  impact: AmendmentImpact;

  @Prop({ required: true, type: [String] })
  requiredApprovers: string[];

  @Prop({ required: true, type: Array, default: [] })
  approvals: ApprovalEntry[];

  @Prop({
    required: true,
    enum: AmendmentStatus,
    default: AmendmentStatus.PROPOSED,
    index: true,
  })
  status: AmendmentStatus;

  @Prop({ default: null })
  rejectedBy: string | null;

  @Prop({ default: null })
  rejectionReason: string | null;

  @Prop({ default: null })
  rejectedAt: Date | null;

  @Prop({ default: null })
  activatedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AgreementAmendmentSchema =
  SchemaFactory.createForClass(AgreementAmendment);
AgreementAmendmentSchema.index({ agreementId: 1, version: 1 }, { unique: true });
AgreementAmendmentSchema.index({ agreementId: 1, status: 1 });
