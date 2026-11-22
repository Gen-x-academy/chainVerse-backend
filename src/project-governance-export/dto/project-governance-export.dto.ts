import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  GovernanceProjectRole,
  GovernanceRecordKind,
} from '../project-governance-export.types';

export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key scoped to tenant, actor and action. Same key + same payload ' +
      'replays the original response; same key + different payload returns 409.',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
    example: 'gov-export-2027-01-a',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class RegisterGovernanceProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectId!: string;

  @ApiPropertyOptional({
    description:
      'Map of user id to project role (owner, planner, reviewer, viewer).',
    example: { 'user-1': 'owner' },
  })
  @IsOptional()
  @IsObject()
  members?: Record<string, GovernanceProjectRole>;
}

export class RecordGovernanceEntryDto extends MutationDto {
  @ApiProperty({ enum: GovernanceRecordKind })
  @IsEnum(GovernanceRecordKind)
  kind!: GovernanceRecordKind;

  @ApiProperty({
    description:
      'Opaque document or version reference, unique per project and kind.',
    pattern: '^[A-Za-z0-9._:-]{2,128}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{2,128}$/)
  reference!: string;

  @ApiPropertyOptional({
    description:
      'Reference this record builds on: amendments must target accepted terms; approvals must target terms or an amendment.',
    pattern: '^[A-Za-z0-9._:-]{2,128}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{2,128}$/)
  targetReference?: string;

  @ApiProperty({
    description:
      'Short participant-visible label. Shown verbatim in exports, so keep it non-sensitive.',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;
}

export class RequestExportDto extends MutationDto {}

export class RevokeExportDto extends MutationDto {}
