import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sessionId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  mentorId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  menteeId!: string;
}

export class FollowUpActionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agenda?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sharedGoals?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permittedResources?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attendanceState?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [FollowUpActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FollowUpActionDto)
  followUpActions?: FollowUpActionDto[];
}
