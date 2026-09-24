import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ScholarshipProgramStatus } from '../schemas/scholarship-program.schema';

export class OrgScopedQueryDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope)' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class CreateScholarshipProgramDto {
  @ApiProperty({ description: 'Owning organization id (tenant scope)' })
  @IsMongoId()
  organizationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ScholarshipProgramQueryDto extends OrgScopedQueryDto {
  @ApiPropertyOptional({ enum: ScholarshipProgramStatus })
  @IsOptional()
  @IsEnum(ScholarshipProgramStatus)
  status?: ScholarshipProgramStatus;
}

/**
 * DTO for the PATCH /:programId/status endpoint (legacy, kept for backward
 * compatibility with pre-#1122 callers).  New callers should use
 * PATCH /:programId/transition which validates the state machine.
 */
export class UpdateScholarshipProgramStatusDto {
  @ApiProperty({ enum: ScholarshipProgramStatus })
  @IsEnum(ScholarshipProgramStatus)
  status: ScholarshipProgramStatus;
}

/**
 * DTO for the program lifecycle transition endpoint (issue #1122).
 *
 * Authorization notes:
 *   - Only OWNER or ADMIN of the owning organization may trigger transitions.
 *   - The `organizationId` is sourced from the query string and verified by
 *     `OrganizationRolesGuard` before the controller is invoked.
 *
 * Ownership / Tenant notes:
 *   - `organizationId` is supplied via `OrgScopedQueryDto` on the query string;
 *     this DTO carries only the desired target status.
 *   - The service rejects any attempt to transition a program belonging to a
 *     different tenant (getProgram enforces this via a scoped findOne).
 */
export class TransitionProgramStatusDto {
  @ApiProperty({
    enum: ScholarshipProgramStatus,
    description:
      'Target lifecycle status.  Must be reachable from the current status. ' +
      'Legal transitions: DRAFT→PUBLISHED, PUBLISHED→PAUSED, PAUSED→PUBLISHED, ' +
      'PUBLISHED→CLOSED, CLOSED→ARCHIVED.',
  })
  @IsEnum(ScholarshipProgramStatus)
  status: ScholarshipProgramStatus;
}
