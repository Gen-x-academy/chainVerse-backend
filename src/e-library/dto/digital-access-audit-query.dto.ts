import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DigitalAccessOutcome } from '../services/digital-access-audit.service';

export class DigitalAccessAuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by patron identifier' })
  @IsOptional()
  @IsString()
  patronId?: string;

  @ApiPropertyOptional({ description: 'Filter by digital loan id' })
  @IsOptional()
  @IsMongoId()
  loanId?: string;

  @ApiPropertyOptional({ description: 'Filter by edition id' })
  @IsOptional()
  @IsString()
  editionId?: string;

  @ApiPropertyOptional({ description: 'Filter by rendition id' })
  @IsOptional()
  @IsString()
  renditionId?: string;

  @ApiPropertyOptional({ enum: DigitalAccessOutcome, description: 'Filter by outcome' })
  @IsOptional()
  @IsEnum(DigitalAccessOutcome)
  outcome?: DigitalAccessOutcome;

  @ApiPropertyOptional({ description: 'Start of the timestamp range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End of the timestamp range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}