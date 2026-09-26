import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AwardAgreementDocument = HydratedDocument<AwardAgreement>;

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * The set of required declarations an applicant must acknowledge when
 * accepting a scholarship award.  Every declaration key must map to `true`
 * in the acceptance payload; any `false` or absent value causes the request
 * to be rejected with VAL_AGREEMENT_DECLARATIONS_INCOMPLETE.
 *
 * Rationale:
 *   Capturing individual declarations (rather than a single boolean) provides
 *   a granular, auditable record of exactly what the signer acknowledged.
 *   This satisfies legal/compliance requirements and makes it easy to add or
 *   retire specific obligations in future program-terms versions.
 */
export enum AgreementDeclarationKey {
  /** Applicant confirms they have read and understood the full award terms. */
  TERMS_READ = 'terms_read',
  /** Applicant confirms they meet all eligibility conditions stated in the award. */
  ELIGIBILITY_CONFIRMED = 'eligibility_confirmed',
  /**
   * Applicant confirms they will use the award solely for the educational
   * purposes described in the program terms.
   */
  INTENDED_USE_CONFIRMED = 'intended_use_confirmed',
  /**
   * Applicant declares that all information provided in their application was
   * accurate and complete at the time of submission.
   */
  INFORMATION_ACCURATE = 'information_accurate',
  /**
   * Applicant acknowledges that misrepresentation or breach of the award terms
   * may result in rescission and repayment obligations.
   */
  CONSEQUENCES_UNDERSTOOD = 'consequences_understood',
}

/**
 * All declaration keys that must be explicitly set to `true` for an
 * acceptance to be valid.
 */
export const REQUIRED_DECLARATION_KEYS: ReadonlyArray<AgreementDeclarationKey> =
  [
    AgreementDeclarationKey.TERMS_READ,
    AgreementDeclarationKey.ELIGIBILITY_CONFIRMED,
    AgreementDeclarationKey.INTENDED_USE_CONFIRMED,
    AgreementDeclarationKey.INFORMATION_ACCURATE,
    AgreementDeclarationKey.CONSEQUENCES_UNDERSTOOD,
  ];

// ── Sub-documents ─────────────────────────────────────────────────────────────

/**
 * A single recorded declaration within an award agreement.
 *
 * Each entry captures:
 *   - which declaration the applicant acknowledged (`key`)
 *   - the exact timestamp the acknowledgement was recorded (`acknowledgedAt`)
 *
 * The array is written once and never modified (immutability enforced by the
 * service layer via BIZ_AWARD_AGREEMENT_IMMUTABLE).
 *
 * Privacy:
 *   Contains applicant acknowledgement timestamps — internal audit data
 *   scoped to the tenant.  Not exposed to other applicants.
 */
@Schema({ _id: false })
export class AgreementDeclaration {
  /** The declaration the applicant acknowledged. */
  @Prop({ required: true, enum: AgreementDeclarationKey })
  key: AgreementDeclarationKey;

  /** Explicit `true` value confirming the declaration was accepted. */
  @Prop({ required: true })
  acknowledged: boolean;

  /** Server-side timestamp recorded when the declaration was captured. */
  @Prop({ required: true })
  acknowledgedAt: Date;
}

export const AgreementDeclarationSchema =
  SchemaFactory.createForClass(AgreementDeclaration);

// ── Root document ─────────────────────────────────────────────────────────────

/**
 * Authoritative, immutable record of a signed award agreement.
 *
 * One document is created per award at the moment the applicant formally
 * accepts (POST /scholarships/awards/:awardId/accept-with-agreement).
 * Once created the document is never mutated — immutability is enforced by
 * the service layer (any attempt to update an existing agreement returns
 * BIZ_AWARD_AGREEMENT_IMMUTABLE).
 *
 * Relationship to adjacent domain objects:
 *   - `awardId`       → ScholarshipAward (the accepted offer)
 *   - `applicationId` → ScholarshipApplication (the winning application)
 *   - `programId`     → ScholarshipProgram (the funding program)
 *
 * Agreement versioning:
 *   `termsVersionNumber` and `termsSnapshotHash` together identify the exact
 *   version of the program terms the applicant agreed to.  `termsSnapshotHash`
 *   is a SHA-256 hex digest of the canonical JSON serialisation of the
 *   ProgramTermsVersion document (excluding mutable fields such as `status`,
 *   `publishedAt`, `updatedAt`).  This makes the agreement self-verifiable
 *   without having to look up the original terms document.
 *
 * Signer identity:
 *   `signerUserId`    — JWT `sub` of the authenticated applicant.
 *   `signerIpAddress` — client IP address captured from the HTTP request for
 *                       regulatory audit purposes.
 *   `signedAt`        — server-side timestamp; never supplied by the client.
 *
 * Declarations:
 *   Every required declaration key listed in REQUIRED_DECLARATION_KEYS must
 *   be present in `declarations` with `acknowledged = true`.  The service
 *   validates completeness before persisting.
 *
 * Declined-offer guard:
 *   An agreement may only be created for an award in PENDING_ACCEPTANCE state.
 *   Awards that are DECLINED, OFFER_EXPIRED, or RESCINDED cannot have an
 *   agreement recorded against them (BIZ_AGREEMENT_DECLINED_OFFER).
 *
 * Tenant isolation:
 *   All queries must include `organizationId`.
 *
 * Privacy:
 *   Contains PII (signerUserId, signerIpAddress) and legally sensitive
 *   financial conditions (termsSnapshotHash).  Restrict read access to
 *   OWNER/ADMIN and the award's own applicant.
 *
 * Migration:
 *   New collection `scholarship_award_agreements`.
 *   No existing collections are modified.
 *   The unique index `{ awardId: 1 }` ensures at most one agreement per award.
 *
 * Operational impact:
 *   Documents are written once and never deleted.  Retain indefinitely for
 *   legal compliance.  If the collection grows large, add a TTL index only
 *   after confirming with legal that retention obligations are met.
 */
@Schema({ timestamps: true, collection: 'scholarship_award_agreements' })
export class AwardAgreement {
  /** Tenant scope — matches the owning award's organizationId. */
  @Prop({ required: true, index: true })
  organizationId: string;

  /**
   * The award this agreement records acceptance of.
   * Unique — at most one agreement per award.
   */
  @Prop({
    required: true,
    unique: true,
    type: Types.ObjectId,
    ref: 'ScholarshipAward',
    index: true,
  })
  awardId: Types.ObjectId;

  /** Denormalized application reference for cross-collection queries. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipApplication',
    index: true,
  })
  applicationId: Types.ObjectId;

  /** Denormalized program reference for program-level audit queries. */
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'ScholarshipProgram',
    index: true,
  })
  programId: Types.ObjectId;

  // ── Terms version ──────────────────────────────────────────────────────────

  /**
   * The sequential version number of the ProgramTermsVersion document the
   * applicant agreed to.  Denormalized for human readability in audit reports.
   */
  @Prop({ required: true })
  termsVersionNumber: number;

  /**
   * SHA-256 hex digest of the canonical JSON serialisation of the
   * ProgramTermsVersion document (immutable fields only: eligibility,
   * deadlines, awardValue, awardCurrency, obligations, versionNumber).
   *
   * Allows the agreement to be verified against the original terms document
   * without needing the live document, even years later.
   *
   * Immutable: `{ immutable: true }` prevents Mongoose from overwriting it.
   */
  @Prop({ required: true, immutable: true, lowercase: true, trim: true })
  termsSnapshotHash: string;

  // ── Signer identity ────────────────────────────────────────────────────────

  /**
   * JWT `sub` of the authenticated applicant who accepted the award.
   * Must equal `award.applicantId`; the service validates this before persisting.
   *
   * Immutable — set once at creation.
   */
  @Prop({ required: true, immutable: true, index: true })
  signerUserId: string;

  /**
   * Client IP address captured from the HTTP request at the moment of
   * acceptance.  Stored for regulatory / fraud-audit purposes.
   *
   * Format: IPv4 or IPv6 string.  May be `null` when the request passes
   * through a proxy that strips `X-Forwarded-For` (e.g. in test environments).
   *
   * Privacy: PII — scope to tenant; never expose to other applicants.
   */
  @Prop({ default: null, trim: true })
  signerIpAddress: string | null;

  /**
   * Server-side timestamp when the agreement was signed.
   * Always set to `new Date()` by the service; never accepted from the client.
   *
   * Immutable — set once at creation.
   */
  @Prop({ required: true, immutable: true })
  signedAt: Date;

  // ── Declarations ───────────────────────────────────────────────────────────

  /**
   * Array of individual declarations the applicant acknowledged.
   *
   * Every key in REQUIRED_DECLARATION_KEYS must appear with
   * `acknowledged = true`.  The service validates completeness before
   * persisting; partial acknowledgements are rejected with
   * VAL_AGREEMENT_DECLARATIONS_INCOMPLETE.
   *
   * Immutable array — the service never pushes additional entries after
   * creation.
   */
  @Prop({ type: [AgreementDeclarationSchema], required: true })
  declarations: AgreementDeclaration[];

  // ── Optional applicant note ────────────────────────────────────────────────

  /**
   * Optional free-text note from the applicant recorded alongside the
   * agreement (e.g. "I accept under the following understanding…").
   *
   * Privacy: May contain applicant PII; scoped to the tenant.
   * Immutable — set once at creation.
   */
  @Prop({ trim: true, maxlength: 2000, default: null })
  applicantNote: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AwardAgreementSchema =
  SchemaFactory.createForClass(AwardAgreement);

// ── Compound indexes ──────────────────────────────────────────────────────────

/**
 * Tenant-scoped lookup by program — used for program-level agreement audits.
 * (organizationId, programId) covers "all agreements for this program".
 */
AwardAgreementSchema.index({ organizationId: 1, programId: 1 });

/**
 * Signer lookup — used to find all agreements signed by a given applicant
 * within a tenant (e.g. compliance / data-subject-access-request queries).
 */
AwardAgreementSchema.index({ organizationId: 1, signerUserId: 1 });
