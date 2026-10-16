import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EvidenceSubmitterType, EvidenceType } from '../scholarship.constants';
import { applyImmutableFields } from './immutable-fields';

export type MilestoneEvidenceDocument = HydratedDocument<MilestoneEvidence>;

@Schema({ _id: false })
export class EncryptedPayload {
  @Prop({ required: true })
  algorithm: string;

  @Prop({ required: true })
  keyId: string;

  @Prop({ required: true })
  iv: string;

  @Prop({ required: true })
  authTag: string;

  @Prop({ required: true })
  ciphertext: string;
}

export const EncryptedPayloadSchema =
  SchemaFactory.createForClass(EncryptedPayload);

/**
 * One immutable, versioned evidence submission for an award milestone.
 *
 * Privacy minimisation: the only plaintext fields are routing metadata. The
 * evidence content (free-form details and document references) is stored as
 * AES-256-GCM ciphertext, and `contentDigest` is an HMAC rather than a bare
 * hash so low-entropy content cannot be recovered by guessing.
 */
@Schema({ timestamps: true, collection: 'scholarship_milestone_evidence' })
export class MilestoneEvidence {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  awardId: string;

  @Prop({ required: true })
  scheduleId: string;

  @Prop({ required: true })
  milestoneKey: string;

  /** 1-based, contiguous per `(awardId, milestoneKey)`. */
  @Prop({ required: true, min: 1 })
  version: number;

  /** Client-chosen key; replays with the same key return this record. */
  @Prop({ required: true })
  submissionKey: string;

  @Prop({ type: String, required: true, enum: Object.values(EvidenceType) })
  evidenceType: EvidenceType;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(EvidenceSubmitterType),
  })
  submitterType: EvidenceSubmitterType;

  @Prop({ required: true })
  submittedBy: string;

  @Prop({ required: true })
  contentDigest: string;

  @Prop({ required: true, min: 0 })
  documentReferenceCount: number;

  @Prop({ type: EncryptedPayloadSchema, required: true })
  payload: EncryptedPayload;
}

export const MilestoneEvidenceSchema =
  SchemaFactory.createForClass(MilestoneEvidence);

MilestoneEvidenceSchema.index(
  { awardId: 1, milestoneKey: 1, version: 1 },
  { unique: true },
);
MilestoneEvidenceSchema.index(
  { awardId: 1, milestoneKey: 1, submissionKey: 1 },
  { unique: true },
);

// Evidence is append-only: a correction is a new version.
applyImmutableFields(MilestoneEvidenceSchema, 'MilestoneEvidence', [
  'organizationId',
  'awardId',
  'scheduleId',
  'milestoneKey',
  'version',
  'submissionKey',
  'evidenceType',
  'submitterType',
  'submittedBy',
  'contentDigest',
  'documentReferenceCount',
  'payload',
]);
