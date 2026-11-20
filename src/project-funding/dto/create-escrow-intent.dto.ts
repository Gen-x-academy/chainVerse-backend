import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EscrowAsset, ReleaseConditionType } from '../entities';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class ReleaseConditionDto {
  @ApiProperty({
    enum: ReleaseConditionType,
    example: ReleaseConditionType.DELIVERABLE_ACCEPTED,
  })
  @IsEnum(ReleaseConditionType)
  type: ReleaseConditionType;

  @ApiProperty({ example: 'deliverable-3', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  ref: string;
}

export class CreateEscrowIntentDto {
  @ApiProperty({ example: 'intent-req-01J9Z8Q7' })
  @IsString()
  @Matches(ID_PATTERN)
  requestId: string;

  @ApiProperty({ example: 'tenant-alpha' })
  @IsString()
  @Matches(ID_PATTERN)
  tenantId: string;

  @ApiProperty({ example: 'project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  projectId: string;

  @ApiProperty({ example: 'charter-project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  charterId: string;

  @ApiProperty({ example: 'member-1' })
  @IsString()
  @Matches(ID_PATTERN)
  payerId: string;

  @ApiProperty({ example: 100000, minimum: 1 })
  @IsInt()
  @Min(1)
  amountMinor: number;

  @ApiProperty({ enum: EscrowAsset, example: EscrowAsset.USD })
  @IsEnum(EscrowAsset)
  asset: EscrowAsset;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiProperty({ example: '2027-01-01T00:00:00.000Z' })
  @IsISO8601()
  expiresAt: string;

  @ApiProperty({ type: [ReleaseConditionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReleaseConditionDto)
  conditions: ReleaseConditionDto[];

  @ApiProperty({ example: 2, minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;
}
