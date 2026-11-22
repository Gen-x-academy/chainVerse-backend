import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_DEPENDENCIES_PER_TASK,
  ScheduleProjectRole,
  TaskStatus,
} from '../project-schedule-risk.types';

export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key scoped to tenant, actor and action. Same key + same payload ' +
      'replays the original response; same key + different payload returns 409.',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
    example: 'schedule-task-create-001',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class RegisterScheduleProjectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectId!: string;

  @ApiPropertyOptional({
    description: 'Map of user id to project role (owner | planner | viewer).',
    example: { 'user-1': ScheduleProjectRole.OWNER },
  })
  @IsOptional()
  @IsObject()
  members?: Record<string, ScheduleProjectRole>;

  @ApiPropertyOptional({
    description: 'Project deadline (YYYY-MM-DD). Null or omitted clears it.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  deadline?: string | null;
}

export class CreateTaskDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Assignee user id.', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  assigneeId?: string | null;

  @ApiProperty({ example: '2026-12-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-05', description: 'Inclusive end date.' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    description:
      'Ids of predecessor tasks in the same project (finish-to-start).',
    type: [String],
    maxItems: MAX_DEPENDENCIES_PER_TASK,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DEPENDENCIES_PER_TASK)
  @ArrayUnique()
  @IsString({ each: true })
  dependsOn?: string[];
}

export class UpdateTaskDto extends MutationDto {
  @ApiProperty({ description: 'Version the client last read.', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_DEPENDENCIES_PER_TASK })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DEPENDENCIES_PER_TASK)
  @ArrayUnique()
  @IsString({ each: true })
  dependsOn?: string[];
}

export class TransitionTaskDto extends MutationDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

export class TakeSnapshotDto extends MutationDto {
  @ApiPropertyOptional({
    description: 'Analysis date (YYYY-MM-DD). Defaults to today (UTC).',
  })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}
