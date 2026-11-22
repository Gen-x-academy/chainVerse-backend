import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BreachSeverity,
  BreachStatus,
  ConductTrack,
} from '../capstone-conduct.types';

export class MutationDto {
  @ApiProperty({
    description:
      'Client-generated retry key scoped to tenant, actor and action. Same key + same payload ' +
      'replays the original response; same key + different payload returns 409.',
    pattern: '^[A-Za-z0-9._-]{8,128}$',
    example: 'conduct-publish-2027-01',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{8,128}$/)
  idempotencyKey!: string;
}

export class PublishPolicyDto extends MutationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description:
      'SHA-256 (hex) of the policy text held by the content system. The text itself is never stored here.',
    pattern: '^[a-f0-9]{64}$',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  contentDigest!: string;

  @ApiProperty({ enum: ConductTrack, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsEnum(ConductTrack, { each: true })
  tracks!: ConductTrack[];

  @ApiPropertyOptional({
    description:
      'When true, users who acknowledged an earlier version must acknowledge this one. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  requiresReacknowledgement?: boolean;
}

export class AcknowledgePolicyDto extends MutationDto {
  @ApiProperty({ enum: ConductTrack })
  @IsEnum(ConductTrack)
  track!: ConductTrack;

  @ApiProperty({
    description:
      'The policy version being acknowledged. Must be the current version.',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  policyVersion!: number;
}

export class RecordBreachDto extends MutationDto {
  @ApiProperty({
    description:
      'Opaque case id from the restricted trust-and-safety system. No narrative, evidence or reporter details.',
    pattern: '^[A-Za-z0-9._:-]{4,128}$',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{4,128}$/)
  caseReference!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  subjectUserId!: string;

  @ApiProperty({ enum: ConductTrack })
  @IsEnum(ConductTrack)
  track!: ConductTrack;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  policyVersion!: number;

  @ApiProperty({ enum: BreachSeverity })
  @IsEnum(BreachSeverity)
  severity!: BreachSeverity;
}

export class TransitionBreachDto extends MutationDto {
  @ApiProperty({ enum: BreachStatus })
  @IsEnum(BreachStatus)
  status!: BreachStatus;
}
