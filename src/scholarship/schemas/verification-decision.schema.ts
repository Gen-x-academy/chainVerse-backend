import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  VerificationDecisionType,
  VerificationReasonCode,
} from '../scholarship.constants';
import { applyImmutableFields } from './immutable-fields';

export type VerificationDecisionDocument =
  HydratedDocument<VerificationDecision>;

/**
 * Append-only record of a verifier's decision on one evidence version. The
 * unique index on `evidenceId` means a given submission is decided once.
 */
@Schema({ timestamps: true, collection: 'scholarship_verification_decisions' })
export class VerificationDecision {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  awardId: string;

  @Prop({ required: true })
  milestoneKey: string;

  @Prop({ required: true, unique: true })
  evidenceId: string;

  @Prop({ required: true })
  evidenceVersion: number;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(VerificationDecisionType),
  })
  decision: VerificationDecisionType;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(VerificationReasonCode),
  })
  reasonCode: VerificationReasonCode;

  /** Reviewer note; must not contain evidence content. */
  @Prop({ type: String, default: null, maxlength: 1000 })
  note: string | null;

  @Prop({ required: true })
  verifierId: string;

  @Prop({ required: true })
  assignmentId: string;
}

export const VerificationDecisionSchema =
  SchemaFactory.createForClass(VerificationDecision);

VerificationDecisionSchema.index({ awardId: 1, milestoneKey: 1, createdAt: 1 });

applyImmutableFields(VerificationDecisionSchema, 'VerificationDecision', [
  'organizationId',
  'awardId',
  'milestoneKey',
  'evidenceId',
  'evidenceVersion',
  'decision',
  'reasonCode',
  'note',
  'verifierId',
  'assignmentId',
]);
