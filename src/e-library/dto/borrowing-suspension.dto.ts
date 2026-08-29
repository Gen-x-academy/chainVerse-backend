import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { SuspensionReason } from '../schemas/borrowing-suspension.schema';

/**
 * Staff-initiated manual suspension.
 * Policy-derived suspensions are created automatically by the service.
 */
export class CreateSuspensionDto {
  @ApiProperty({
    description: 'Patron user ID to suspend',
    example: 'patron-abc',
  })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({
    description: 'Human-readable explanation shown to the patron, including remediation steps',
    example: 'Account suspended due to 3 overdue items. Return overdue items to restore access.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description:
      'ISO 8601 datetime string for when the suspension expires (if time-bounded). ' +
      'Leave unset for suspensions that only lift via reconciliation.',
    example: '2026-09-30T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  suspendedUntil?: string;
}

/**
 * Lift a suspension as a staff exception (override).
 */
export class LiftSuspensionDto {
  @ApiProperty({
    description: 'Reason or note explaining why the suspension is being lifted as an exception',
    example: 'Patron has agreed to a repayment plan.',
  })
  @IsString()
  @IsNotEmpty()
  liftNote: string;
}

/**
 * Query parameters for listing suspensions.
 */
export class SuspensionQueryDto {
  @ApiPropertyOptional({
    description: 'Filter to only active suspensions',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by patron ID (admin/moderator only)',
    example: 'patron-abc',
  })
  @IsOptional()
  @IsString()
  patronId?: string;
}
