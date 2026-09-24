import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EligibilityAttestationDocument =
  HydratedDocument<EligibilityAttestation>;

/**
 * Scope identifies which eligibility domain the claim covers.
 * Each scope maps to a specific upstream issuer system.
 *
 *   ENROLLMENT        – issued by the enrollment service
 *   IDENTITY          – issued by the identity/KYC service
 *   COURSE_COMPLETION – issued by the course completion service
 *   PARTNER           – issued by an external partner organization
 *   INCOME            – issued by a verified income-verification service
 */
export enum AttestationScope {
  ENROLLMENT = 'enrollment',
  IDENTITY = 'identity',
  COURSE_COMPLETION = 'course_completion',
  PARTNER = 'partner',
  INCOME = 'income',
}

export enum AttestationStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * A verified, time-bounded eligibility claim from a trusted issuer.
 *
 * Design invariants:
 *   - Claims become invalid **immediately** on revocation (status=REVOKED) or
 *     when `expiresAt` has passed (status=EXPIRED).
 *   - `payload` stores only the minimal claim data needed for eligibility
 *     evaluation; full source data is never copied here (privacy minimization).
 *   - `issuer`, `scope`, and `version` together identify the claim's provenance.
 *   - Revocation is soft-delete only: the document is preserved for audit.
 *
 * Privacy:
 *   - Scoped to organizationId + programId + applicantId.
 *   - `payload` must not contain raw PII; only claim attributes (e.g. a
 *     boolean `enrolled: true`, not a full enrollment record).
 *
 * Migration:
 *   - New collection `scholarship_eligibility_attestations`. No existing data affected.
 */
@Schema({ timestamps: true, collection: 'scholarship_eligibility_attestations' })
export class EligibilityAttestation {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram', index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, index: true })
  applicantId: string;

  /** Identity of the system or service that issued this claim. */
  @Prop({ required: true, trim: true, maxlength: 200 })
  issuer: string;

  @Prop({ required: true, enum: AttestationScope })
  scope: AttestationScope;

  /** Claim schema version, e.g. "1.0" or "2024-01". */
  @Prop({ required: true, trim: true, maxlength: 20 })
  version: string;

  /**
   * Privacy-minimized claim payload (only threshold/boolean attributes;
   * no raw PII such as full name, address, or income amount).
   */
  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({
    required: true,
    enum: AttestationStatus,
    default: AttestationStatus.ACTIVE,
    index: true,
  })
  status: AttestationStatus;

  /** UTC timestamp after which this claim expires regardless of status. */
  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ required: true })
  issuedAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokedBy?: string;

  @Prop({ trim: true, maxlength: 500 })
  revocationReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EligibilityAttestationSchema =
  SchemaFactory.createForClass(EligibilityAttestation);

EligibilityAttestationSchema.index(
  { programId: 1, applicantId: 1, scope: 1, status: 1 },
);
// For expiry sweep job
EligibilityAttestationSchema.index({ expiresAt: 1, status: 1 });
EligibilityAttestationSchema.index({ organizationId: 1, programId: 1 });
