import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AppealGrounds,
  AppealStatus,
} from '../schemas/application-appeal.schema';

// ── Evidence item ─────────────────────────────────────────────────────────────

/**
 * A single piece of supporting evidence attached to a new appeal.
 *
 * File uploads must be handled via the platform's upload service first.
 * Supply the resulting HTTPS URL here along with a human-readable label.
 */
export class AppealEvidenceDto {
  @ApiProperty({
    description:
      'Human-readable label for this piece of evidence ' +
      '(e.g. "Official transcript — Spring 2026", "Medical certificate").',
    maxLength: 300,
    example: 'Official transcript — Spring 2026',
  })
  @IsString()
  @MaxLength(300)
  label: string;

  @ApiProperty({
    description:
      'HTTPS URL pointing to the evidence artifact. ' +
      'Upload the file via the platform upload API first and supply the ' +
      'resulting URL here.',
    maxLength: 2000,
    example: 'https://cdn.example.com/uploads/transcript-abc123.pdf',
  })
  @IsUrl({ require_tld: true, require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  url: string;

  @ApiPropertyOptional({
    description:
      'Optional free-text description providing context for this evidence.',
    maxLength: 1000,
    example: 'Certified copy obtained from the registrar on 2026-09-20.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

// ── Submit appeal ─────────────────────────────────────────────────────────────

/**
 * Body DTO for `POST …/applications/:applicationId/appeals`.
 *
 * Authorization: the authenticated applicant who owns the application.
 *
 * Business rules enforced by the service:
 *   - Application must exist and be owned by the calling applicant within
 *     the given organization.
 *   - Application must be in REJECTED status or have a CommitteeDecision
 *     with outcome REJECTED; otherwise BIZ_APPEAL_NOT_ELIGIBLE is thrown.
 *   - At most one active appeal (PENDING or UNDER_REVIEW) may exist for the
 *     application at a time; a second call returns 409 BIZ_APPEAL_ALREADY_ACTIVE.
 *   - `resolutionDeadline` (if supplied) must be a future date; the service
 *     falls back to a configured default window when omitted.
 *   - `grounds` is required; for AppealGrounds.OTHER the `statement` must
 *     describe the grounds in sufficient detail.
 */
export class SubmitAppealDto {
  @ApiProperty({
    enum: AppealGrounds,
    description:
      'The grounds category for this appeal. ' +
      'Choose the most accurate category; use OTHER only when no other ' +
      'category applies and describe the grounds fully in `statement`.',
    example: AppealGrounds.NEW_EVIDENCE,
  })
  @IsEnum(AppealGrounds)
  grounds: AppealGrounds;

  @ApiProperty({
    description:
      'Detailed narrative explaining the basis for the appeal. ' +
      'Must provide meaningful context beyond the grounds category alone. ' +
      'Required; maximum 5 000 characters.',
    maxLength: 5000,
    example:
      'I received new official test scores on 2026-09-18 that were not ' +
      'available before the decision was made. The attached transcript ' +
      'shows I now meet the minimum GPA threshold stated in the program terms.',
  })
  @IsString()
  @MaxLength(5000)
  statement: string;

  @ApiPropertyOptional({
    type: [AppealEvidenceDto],
    description:
      'Optional supporting evidence items. Each item must reference an ' +
      'already-uploaded HTTPS URL. Supply at least one item when ' +
      '`grounds` is NEW_EVIDENCE.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppealEvidenceDto)
  evidence?: AppealEvidenceDto[];

  @ApiPropertyOptional({
    description:
      'Resolution deadline (ISO-8601 UTC) by which staff must decide the ' +
      'appeal. When omitted the service applies the default configured ' +
      'window (e.g. 30 days from submission). Must be a future timestamp.',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  resolutionDeadline?: string;
}

// ── Withdraw appeal ───────────────────────────────────────────────────────────

/**
 * Body DTO for `DELETE …/appeals/:appealId`.
 *
 * Authorization: the authenticated applicant who owns the appeal.
 *
 * Business rules enforced by the service:
 *   - Appeal must be in PENDING or UNDER_REVIEW status.
 *   - Only the applicant who filed the appeal may withdraw it.
 */
export class WithdrawAppealDto {
  @ApiPropertyOptional({
    description: 'Optional reason for withdrawing the appeal.',
    maxLength: 500,
    example: 'I have decided to re-apply in the next cycle instead.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ── Take ownership ────────────────────────────────────────────────────────────

/**
 * Body DTO for `PATCH …/appeals/:appealId/assign`.
 *
 * Staff (OWNER or ADMIN) assigns a reviewer to the appeal, transitioning
 * status from PENDING → UNDER_REVIEW.
 *
 * Authorization: OWNER or ADMIN of the organization.
 *
 * Business rules enforced by the service:
 *   - Appeal must be in PENDING status.
 *   - `reviewerId` must not appear in the appeal's `excludedReviewerIds`.
 *   - When `reviewerId` is omitted the service assigns the calling staff
 *     member (i.e. self-assignment).
 */
export class AssignAppealDto {
  @ApiPropertyOptional({
    description:
      'JWT `sub` of the staff member who will review the appeal. ' +
      'Must not be one of the original reviewers (see excludedReviewerIds ' +
      'on the appeal document). Defaults to the calling user when omitted.',
    example: 'auth0|staff-reviewer-001',
  })
  @IsOptional()
  @IsString()
  assignedReviewerId?: string;
}

// ── Resolve appeal ────────────────────────────────────────────────────────────

/**
 * Body DTO for `PATCH …/appeals/:appealId/resolve`.
 *
 * Staff (OWNER or ADMIN) records the final decision on an appeal,
 * transitioning status to UPHELD or DISMISSED.
 *
 * Authorization: OWNER or ADMIN of the organization.
 * Service enforces that the caller is the assigned reviewer (or an OWNER
 * overriding without prior assignment).
 *
 * Business rules enforced by the service:
 *   - Appeal must be in UNDER_REVIEW status.
 *   - `resolution` must be UPHELD or DISMISSED (not a lifecycle state).
 *   - `reason` is mandatory — stored as `resolutionReason` on the document
 *     and surfaced to the applicant in the notification.
 *   - `reviewNotes` are optional internal notes stored on the document
 *     (staff-only; never returned to the applicant).
 *   - When UPHELD the service transitions the linked application status
 *     back to UNDER_REVIEW so a new review round can be opened.
 */
export class ResolveAppealDto {
  @ApiProperty({
    enum: [AppealStatus.UPHELD, AppealStatus.DISMISSED],
    description:
      'The outcome of the appeal review. ' +
      'UPHELD — appeal is sustained; original decision is reversed and the ' +
      'application is returned to UNDER_REVIEW for a fresh review round. ' +
      'DISMISSED — appeal is rejected; original decision stands.',
    example: AppealStatus.UPHELD,
  })
  @IsEnum(AppealStatus)
  resolution: AppealStatus.UPHELD | AppealStatus.DISMISSED;

  @ApiProperty({
    description:
      'Mandatory rationale for the decision. Shown to the applicant in the ' +
      'outcome notification. Keep concise — detailed deliberation notes go ' +
      'in `reviewNotes`. Maximum 2 000 characters.',
    maxLength: 2000,
    example:
      'The new evidence submitted demonstrates the applicant meets the ' +
      'minimum GPA threshold. The original decision is reversed and a ' +
      'fresh review round will be opened.',
  })
  @IsString()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({
    description:
      'Internal staff notes. Staff-only — never returned to the applicant. ' +
      'Maximum 5 000 characters.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reviewNotes?: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────

/**
 * Minimal query DTO for endpoints that only need the tenant scope.
 */
export class AppealScopeQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;
}

/**
 * Query parameters for listing appeals across a program or application.
 */
export class ListAppealsQueryDto {
  @ApiProperty({
    description: 'Owning organization id (tenant scope).',
    example: '665f1b2c3d4e5f6a7b8c9d0e',
  })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: AppealStatus,
    description: 'Filter results by appeal status.',
  })
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;

  @ApiPropertyOptional({
    enum: AppealGrounds,
    description: 'Filter results by appeal grounds category.',
  })
  @IsOptional()
  @IsEnum(AppealGrounds)
  grounds?: AppealGrounds;
}

// ── Response shape ────────────────────────────────────────────────────────────

/**
 * Public shape of an appeal returned by the API.
 *
 * Staff (OWNER / ADMIN) receive the full document including `reviewNotes`,
 * `excludedReviewerIds`, and the full `auditTrail`.
 *
 * Applicants receive a projected view: `reviewNotes` is omitted,
 * `excludedReviewerIds` is omitted, and `auditTrail` is omitted.
 * The projection is applied in the service via `toApplicantResult`.
 */
export interface AppealResult {
  id: string;
  organizationId: string;
  applicationId: string;
  programId: string;
  applicantId: string;
  /** Original reviewer ids excluded from this appeal. Staff-only field. */
  excludedReviewerIds?: string[];
  grounds: AppealGrounds;
  statement: string;
  evidence: Array<{
    id: string;
    label: string;
    url: string;
    description?: string;
    attachedAt: string;
  }>;
  status: AppealStatus;
  resolutionDeadline: string;
  assignedReviewerId: string | null;
  assignedAt: string | null;
  /** Internal reviewer notes. Staff-only field — omitted in applicant view. */
  reviewNotes?: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  withdrawalReason: string | null;
  withdrawnAt: string | null;
  /** Full audit trail. Staff-only field — omitted in applicant view. */
  auditTrail?: Array<{
    action: string;
    actorId: string;
    actorDisplayName?: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
}
