import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ParticipantRole } from '../mentorship.constants';

export class UpsertMentorshipProfileDto {
  @ApiProperty({ enum: ParticipantRole })
  @IsEnum(ParticipantRole)
  kind!: ParticipantRole;

  @ApiProperty({ type: [String], example: ['soroban', 'defi'] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  focusAreas!: string[];

  @ApiProperty({ type: [String], example: ['soroban-foundations'] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  programIds!: string[];

  @ApiPropertyOptional({ description: 'Mentor only', minimum: 0, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maxActiveMentees?: number;

  @ApiPropertyOptional({ description: 'Mentor only' })
  @IsOptional()
  @IsBoolean()
  acceptingMentees?: boolean;
}

export class ProfileKindQueryDto {
  @ApiProperty({ enum: ParticipantRole })
  @IsEnum(ParticipantRole)
  kind!: ParticipantRole;
}

export class SetEligibilityDto {
  @ApiProperty({ enum: ParticipantRole })
  @IsEnum(ParticipantRole)
  kind!: ParticipantRole;

  @ApiProperty()
  @IsBoolean()
  eligible!: boolean;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class CreateBlockDto {
  @ApiProperty({ description: 'User to block from matching with you' })
  @IsMongoId()
  userId!: string;

  @ApiPropertyOptional({ description: 'Private to you; never shown to the blocked user', maxLength: 500 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
