import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProposalStatus } from '../mentorship.constants';

export class QueryProposalsDto {
  @ApiPropertyOptional({ enum: ProposalStatus })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CoordinatorQueryProposalsDto extends QueryProposalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  mentorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  menteeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  programId?: string;
}
