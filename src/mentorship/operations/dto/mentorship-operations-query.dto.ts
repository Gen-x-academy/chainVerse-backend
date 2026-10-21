import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict analytics to a single program (tenant scope).',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({
    description: 'Restrict analytics to a single cohort within the program.',
    example: '507f1f77bcf86cd799439012',
  })
  @IsMongoId()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive window start (ISO 8601). Defaults to 30 days ago.',
    example: '2026-09-18T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Exclusive window end (ISO 8601). Defaults to now.',
    example: '2026-10-18T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  to?: string;
}

/**
 * Exports are always explicitly scoped to one program (the tenant boundary)
 * so a single request can never widen into a cross-program dump.
 */
export class AnalyticsExportQueryDto extends AnalyticsQueryDto {
  @ApiProperty({
    description: 'Export format. Small groups are always suppressed.',
    enum: ['csv', 'json'],
    default: 'json',
  })
  @IsIn(['csv', 'json'])
  @IsOptional()
  format?: 'csv' | 'json';

  @ApiProperty({
    description: 'Program to export (required – tenant scope).',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsNotEmpty()
  declare programId: string;
}

export class MentorDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Day lookahead for upcoming sessions/tasks (1-90).',
    example: 14,
    default: 14,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  @IsOptional()
  days?: number = 14;

  @ApiPropertyOptional({
    description:
      'Mentor to inspect. Only administrators may view another mentor; ' +
      'tutors are always scoped to themselves.',
    example: '507f1f77bcf86cd799439013',
  })
  @IsMongoId()
  @IsOptional()
  mentorId?: string;
}

export class MentorSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Page number.', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size (max 100).', default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by session status.',
    enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
  })
  @IsIn(['scheduled', 'completed', 'cancelled', 'no_show'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Only sessions starting at/after this time.',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Only sessions starting before this time.',
  })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class MentorEarningsQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive window start (ISO 8601). Defaults to 90 days ago.',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive window end (ISO 8601).' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class AlertQueryDto {
  @ApiPropertyOptional({
    description: 'Return only unread alerts.',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  unreadOnly?: boolean;
}

export class CoordinatorDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Scope the dashboard to one program.' })
  @IsMongoId()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({ description: 'Scope the dashboard to one cohort.' })
  @IsMongoId()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description: 'Expiring-proposal lookahead in hours (1-720).',
    example: 72,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(720)
  @IsOptional()
  windowHours?: number;

  @ApiPropertyOptional({
    description:
      'Ignore saved filters and use only the parameters passed here.',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  ignoreSavedFilters?: boolean;

  @ApiPropertyOptional({
    description: 'Include resolved/dismissed disputes in the disputes card.',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  includeResolvedDisputes?: boolean;
}

export class SaveDashboardFiltersDto {
  @ApiPropertyOptional({ description: 'Persisted program scope.' })
  @IsMongoId()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({ description: 'Persisted cohort scope.' })
  @IsMongoId()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({
    description: 'Persisted expiring-proposal lookahead (hours).',
    example: 72,
    default: 72,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(720)
  @IsOptional()
  windowHours?: number = 72;

  @ApiPropertyOptional({
    description: 'Persist "include resolved disputes" preference.',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  includeResolvedDisputes?: boolean = false;
}

export class CoordinatorQueueQueryDto {
  @ApiPropertyOptional({ description: 'Page number.', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size (max 100).', default: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 25;

  @ApiPropertyOptional({ description: 'Filter the queue to one program.' })
  @IsMongoId()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({ description: 'Filter the queue to one cohort.' })
  @IsMongoId()
  @IsOptional()
  cohortId?: string;
}
