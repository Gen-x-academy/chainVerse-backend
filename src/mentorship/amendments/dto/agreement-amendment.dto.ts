import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Preview the effect of a proposed change without persisting anything. */
export class PreviewAmendmentDto {
  @ApiProperty({ description: 'Terms document currently in force' })
  @IsObject()
  currentTerms!: Record<string, unknown>;

  @ApiProperty({ description: 'Requested changes (cadence, scope, dates, price, policies)' })
  @IsObject()
  changes!: Record<string, unknown>;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  participantIds!: string[];
}

/** Propose a versioned amendment; it is inert until approved and activated. */
export class ProposeAmendmentDto {
  @ApiProperty({ minimum: 2 })
  @IsInt()
  @Min(2)
  version!: number;

  @ApiProperty({ minimum: 1, description: 'Version this amendment supersedes' })
  @IsInt()
  @Min(1)
  supersedes!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  participantIds!: string[];

  @ApiProperty({ description: 'Baseline terms the change is computed against' })
  @IsObject()
  currentTerms!: Record<string, unknown>;

  @ApiProperty({ description: 'Requested changes to cadence/scope/dates/price/policies' })
  @IsObject()
  changes!: Record<string, unknown>;
}

export class ApproveAmendmentDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectAmendmentDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class ActivateAmendmentDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
