import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDate,
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
  ValidateNested,
} from 'class-validator';
import { SoftCheck } from '../mentorship.constants';
import { CreateMatchProposalDto } from './create-match-proposal.dto';
import { MatchTermsDto } from './match-terms.dto';

export class SoftCheckOverrideDto {
  @ApiProperty({
    enum: SoftCheck,
    description: 'Only soft checks can be overridden; hard checks and blocks never can',
  })
  @IsEnum(SoftCheck)
  check!: SoftCheck;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

/** Proposal opened by a coordinator on behalf of two participants. */
export class CoordinatorCreateProposalDto extends CreateMatchProposalDto {
  @ApiProperty({
    description: 'Why the coordinator proposed this match (shown to both participants)',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Coordinator-only note', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  @ApiPropertyOptional({ type: [SoftCheckOverrideDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(SoftCheck).length)
  @ArrayUnique((o: SoftCheckOverrideDto) => o.check)
  @ValidateNested({ each: true })
  @Type(() => SoftCheckOverrideDto)
  overrides?: SoftCheckOverrideDto[];

  @ApiPropertyOptional({
    description: 'Pending proposal this one replaces (e.g. reassigning the mentor)',
  })
  @IsOptional()
  @IsMongoId()
  supersedesProposalId?: string;
}

/** Coordinator change to a pending proposal. Clears approvals; participants must re-approve. */
export class CoordinatorAdjustProposalDto {
  @ApiPropertyOptional({ type: MatchTermsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchTermsDto)
  terms?: MatchTermsDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  @ApiProperty({ description: 'Reason shown to participants', minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class CoordinatorWithdrawProposalDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class OverrideReportQueryDto {
  @ApiPropertyOptional({ description: 'ISO date (inclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date (exclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  coordinatorId?: string;

  @ApiPropertyOptional({ enum: SoftCheck })
  @IsOptional()
  @IsEnum(SoftCheck)
  check?: SoftCheck;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
