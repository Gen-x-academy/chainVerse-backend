import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AgreementDeclarationKey,
  REQUIRED_DECLARATION_KEYS,
} from '../schemas/award-agreement.schema';

// ── Sub-DTOs ──────────────────────────────────────────────────────────────────

/**
 * A single declaration the applicant must explicitly acknowledge.
 *
 * All keys listed in REQUIRED_DECLARATION_KEYS must appear in the parent
 * `declarations` array with `acknowledged = true`.  The service validates
 * completeness and rejects partial acknowledgements with
 * VAL_AGREEMENT_DECLARATIONS_INCOMPLETE.
 *
 * Business rules:
 *   - `key` must be a valid AgreementDeclarationKey value.
 *   - `acknowledged` must be `true`; sending `false` for any required key is
 *     treated as an incomplete declaration and the request is rejected.
 */
export class AgreementDeclarationDto {
  @ApiProperty({
    enum: AgreementDeclarationKey,
    description:
      'The declaration key the applicant is acknowledging.  ' +
      'Required keys: ' +
      REQUIRED_DECLARATION_KEYS.join(', ') +
      '.',
    example: AgreementDeclarationKey.TERMS_READ,
  })
  @IsEnum(AgreementDeclarationKey)
  key: AgreementDeclarationKey;

  @ApiProperty({
    description:
      'Must be `true`.  Sending `false` for any required declaration key ' +
      'causes the request to be rejected with ' +
      'VAL_AGREEMENT_DECLARATIONS_INCOMPLETE.',
    example: true,
  })
  @IsBoolean()
  acknowledged: boolean;
}

// ── Accept-with-agreement ─────────────────────────────────────────────────────

/**
 * Body DTO for
 * `POST /scholarships/awards/:awardId/accept-with-agreement`.
 *
 * Combines the formal offer acceptance with the signed agreement record in a
 * single atomic operation:
 *   1. Validates all required declarations are present and acknowledged.
 *   2. Validates the terms version number matches the published terms for the
 *      program (resolved by the service via the award → program relationship).
 *   3. Verifies the caller is the award's applicant.
 *   4. Verifies the award is in PENDING_ACCEPTANCE state and within deadline.
 *   5. Persists an immutable AwardAgreement document.
 *   6. Transitions the award PENDING_ACCEPTANCE → ACCEPTED.
 *   7. Confirms the linked BudgetReservation (PENDING → CONFIRMED) if present.
 *
 * Authorization:
 *   JWT required.  The authenticated user must be the award's applicant
 *   (BIZ_AWARD_ACCEPTANCE_FORBIDDEN if not).
 *
 * Business rules enforced by the service:
 *   - All REQUIRED_DECLARATION_KEYS must appear with `acknowledged = true`
 *     (VAL_AGREEMENT_DECLARATIONS_INCOMPLETE).
 *   - Award must be in PENDING_ACCEPTANCE state (BIZ_AWARD_INVALID_STATE).
 *   - Acceptance deadline must not have passed (BIZ_AWARD_OFFER_EXPIRED).
 *   - Award must not have a previous terminal state or existing agreement
 *     (BIZ_AWARD_AGREEMENT_ALREADY_EXISTS).
 *   - Award must not be DECLINED / OFFER_EXPIRED / RESCINDED
 *     (BIZ_AGREEMENT_DECLINED_OFFER).
 *   - `termsVersionNumber` is resolved internally; clients do not supply it —
 *     the service reads the published terms version from the program record.
 */
export class AcceptAwardWithAgreementDto {
  @ApiProperty({
    description:
      'Owning organization id (tenant scope).  ' +
      'Must match the organization that issued the award.',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiProperty({
    description:
      'Array of declaration acknowledgements.  ' +
      'Every key in [' +
      REQUIRED_DECLARATION_KEYS.join(', ') +
      '] must be present with `acknowledged = true`.  ' +
      'Partial acknowledgement or a missing required key returns 400 ' +
      'VAL_AGREEMENT_DECLARATIONS_INCOMPLETE.',
    type: [AgreementDeclarationDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgreementDeclarationDto)
  declarations: AgreementDeclarationDto[];

  @ApiPropertyOptional({
    description:
      'Optional free-text note from the applicant recorded alongside the ' +
      'signed agreement (e.g. a reference to an external letter of acceptance).  ' +
      'Stored for audit; visible only to OWNER / ADMIN and the applicant.',
    maxLength: 2000,
    example: 'I accept this award and commit to fulfilling all stated obligations.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

// ── Staff: create agreement independently ─────────────────────────────────────

/**
 * Body DTO for `POST /scholarships/awards/:awardId/agreement`.
 *
 * Staff-only endpoint that records a signed agreement document for an award
 * that has already been transitioned to ACCEPTED via a prior call to the
 * standard acceptance endpoint.  Intended for out-of-band acceptance flows
 * (e.g. paper signatures scanned and uploaded by staff).
 *
 * Authorization: OWNER or ADMIN.
 *
 * Business rules enforced by the service:
 *   - Award must be in ACCEPTED state (BIZ_AGREEMENT_NOT_ACCEPTED).
 *   - Award must not already have an agreement document
 *     (BIZ_AWARD_AGREEMENT_ALREADY_EXISTS).
 *   - `signerUserId` must equal `award.applicantId`
 *     (BIZ_AWARD_ACCEPTANCE_FORBIDDEN).
 *   - All REQUIRED_DECLARATION_KEYS must appear with `acknowledged = true`
 *     (VAL_AGREEMENT_DECLARATIONS_INCOMPLETE).
 */
export class CreateAgreementDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiProperty({
    description:
      'JWT `sub` of the applicant who signed the agreement (must equal ' +
      'award.applicantId).',
    example: 'auth0|abc123def456',
  })
  @IsString()
  signerUserId: string;

  @ApiProperty({
    description:
      'The sequential version number of the ProgramTermsVersion the ' +
      'applicant agreed to.  The service verifies this matches a PUBLISHED ' +
      'terms version for the program.',
    example: 3,
  })
  termsVersionNumber: number;

  @ApiProperty({
    description:
      'SHA-256 hex digest of the canonical JSON of the ProgramTermsVersion ' +
      'document (immutable fields).  Used to verify agreement integrity ' +
      'without referencing the live document.',
    example: 'a3f5c2e1b4d6f7a8c9e0b1d2f3a4c5e6f7b8d9e0a1c2b3d4e5f6a7b8c9d0e1f2',
  })
  @IsString()
  @MaxLength(64)
  termsSnapshotHash: string;

  @ApiProperty({
    type: [AgreementDeclarationDto],
    description:
      'All required declaration keys with `acknowledged = true`.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgreementDeclarationDto)
  declarations: AgreementDeclarationDto[];

  @ApiPropertyOptional({
    description: 'Optional IP address of the signer (e.g. captured from paper-form metadata).',
    example: '192.168.1.100',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  signerIpAddress?: string;

  @ApiPropertyOptional({
    description: 'Optional free-text note recorded alongside the agreement.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

// ── Query DTOs ─────────────────────────────────────────────────────────────────

/**
 * Shared query parameters for agreement endpoints requiring tenant scoping.
 */
export class AgreementScopeQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Serialized declaration entry returned inside AwardAgreementResult.
 */
export interface AgreementDeclarationResult {
  key: AgreementDeclarationKey;
  acknowledged: boolean;
  acknowledgedAt: string; // ISO-8601
}

/**
 * Full award agreement payload returned by the service to the controller.
 *
 * Privacy notes:
 *   - `signerIpAddress` is PII; restrict to OWNER / ADMIN.
 *   - `declarations` contain audit timestamps; restrict to OWNER / ADMIN and
 *     the award's own applicant.
 *   - `termsSnapshotHash` is internal financial/legal data; scope to tenant.
 *   - Staff-facing endpoints return the full result.
 *   - Applicant-facing GET returns the full result (own award only).
 */
export interface AwardAgreementResult {
  agreementId: string;
  organizationId: string;
  awardId: string;
  applicationId: string;
  programId: string;
  termsVersionNumber: number;
  termsSnapshotHash: string;
  signerUserId: string;
  signerIpAddress: string | null;
  signedAt: string; // ISO-8601
  declarations: AgreementDeclarationResult[];
  applicantNote: string | null;
  createdAt: string; // ISO-8601
}
