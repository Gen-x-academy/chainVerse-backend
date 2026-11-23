import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuardianConsentDocument = HydratedDocument<GuardianConsentRecord>;

/** The activities a guardian may consent to on behalf of a minor. */
export enum ConsentScope {
  MENTORSHIP = 'mentorship_participation',
  RECORDING = 'session_recording',
  DATA = 'data_processing',
}

export enum RelationshipKind {
  PARENT = 'parent',
  LEGAL_GUARDIAN = 'legal_guardian',
  OTHER = 'other',
}

/** Every decision is a new record; historical rows are never updated. */
export enum GuardianConsentStatus {
  INVITED = 'invited',
  GRANTED = 'granted',
  REVOKED = 'revoked',
  SUPERSEDED = 'superseded',
}

/**
 * Append-only guardian consent record.
 *
 * Only hashes of the invite token, guardian contact and free-text reason are
 * stored. The raw guardian contact is held by the verification provider and is
 * referenced by `verifiedRelationshipRef`; it is never returned to a minor or
 * to another participant. `materialChangeVersionHash` binds the consent to the
 * exact scope snapshot that was presented, so a material change requires a new
 * grant (`re-consent`) rather than silently reusing an older decision.
 */
@Schema({ timestamps: true, collection: 'mentorship_guardian_consents' })
export class GuardianConsentRecord {
  @Prop({ required: true, index: true })
  minorId!: string;

  @Prop({ required: true, index: true })
  engagementId!: string;

  @Prop({ required: true, index: true })
  programId!: string;

  @Prop({ required: true, enum: GuardianConsentStatus })
  status!: GuardianConsentStatus;

  @Prop({ required: true })
  inviteTokenHash!: string;

  @Prop({ required: true })
  guardianContactHash!: string;

  @Prop({ required: true, enum: RelationshipKind })
  relationship!: RelationshipKind;

  /** Opaque reference from the relationship-verification provider. */
  @Prop({ required: true })
  verifiedRelationshipRef!: string;

  @Prop({ type: [String], required: true, default: [] })
  scopes!: ConsentScope[];

  @Prop({ required: true })
  materialChangeVersionHash!: string;

  @Prop({ required: true })
  agePolicyVersion!: number;

  @Prop({ required: true, default: 1 })
  sequence!: number;

  @Prop({ required: true })
  idempotencyKeyHash!: string;

  /** Hash of the prior decision this row supersedes (first invite: null). */
  @Prop({ type: String, default: null })
  supersedesHash!: string | null;

  /** Authenticated guardian id, or a coordinator id for coordinator actions. */
  @Prop({ type: String, default: null })
  decidedBy!: string | null;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  grantedAt!: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, default: null })
  reasonHash!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const GuardianConsentRecordSchema = SchemaFactory.createForClass(
  GuardianConsentRecord,
);

GuardianConsentRecordSchema.index(
  { minorId: 1, engagementId: 1, sequence: 1 },
  { unique: true },
);
GuardianConsentRecordSchema.index({ inviteTokenHash: 1 }, { unique: true });
GuardianConsentRecordSchema.index({ idempotencyKeyHash: 1 }, { unique: true });
GuardianConsentRecordSchema.index({
  minorId: 1,
  engagementId: 1,
  status: 1,
  materialChangeVersionHash: 1,
});
