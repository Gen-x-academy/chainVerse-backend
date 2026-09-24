import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Reason categories for application withdrawal.
 *
 * Stable, machine-readable codes used for analytics and policy enforcement.
 * Clients must map these to human-friendly display labels.
 */
export enum WithdrawalReasonCategory {
  PERSONAL = 'personal',
  ACADEMIC = 'academic',
  FINANCIAL = 'financial',
  PROGRAM_CHANGED = 'program_changed',
  FOUND_ALTERNATIVE = 'found_alternative',
  OTHER = 'other',
}

export class WithdrawApplicationDto {
  /**
   * Must be `true`.  The explicit field forces the client to surface a
   * confirmation step; it cannot be omitted or set to false.
   */
  @ApiProperty({
    description:
      'Explicit confirmation that the applicant intends to withdraw. Must be true.',
    example: true,
  })
  @Equals(true, {
    message: 'confirmWithdrawal must be true — withdrawal requires explicit confirmation',
  })
  confirmWithdrawal: true;

  /** Stable category code for analytics and capacity-release decisions. */
  @ApiProperty({
    enum: WithdrawalReasonCategory,
    description: 'Reason category for the withdrawal',
  })
  @IsEnum(WithdrawalReasonCategory)
  withdrawalReasonCategory: WithdrawalReasonCategory;

  /** Optional free-text elaboration (max 500 chars). */
  @ApiPropertyOptional({
    description: 'Optional free-text reason (max 500 characters)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  withdrawalReason?: string;
}

export class UpsertWithdrawalPolicyDto {
  @ApiProperty({
    description: 'Whether applicants may self-withdraw',
    default: true,
  })
  selfWithdrawalAllowed: boolean;

  @ApiProperty({
    description:
      'Hours after submission within which withdrawal is permitted (0 = no limit)',
    default: 0,
    minimum: 0,
  })
  windowAfterSubmissionHours: number;

  @ApiProperty({
    description: 'Whether withdrawal requires explicit confirmation from the applicant',
    default: true,
  })
  requiresConfirmation: boolean;

  @ApiProperty({
    description: 'Whether withdrawal releases reserved budget capacity',
    default: true,
  })
  releasesCapacityOnWithdrawal: boolean;
}
