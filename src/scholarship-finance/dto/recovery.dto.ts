import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  CollectionMethod,
  RecoveryReason,
  RecoveryStatus,
} from '../domain/finance.enums';
import {
  AmountMinorProperty,
  AssetDto,
  PaginationQueryDto,
  PROGRAM_ID_PATTERN,
} from './common.dto';

export class LegalBasisDto {
  @ApiProperty({ example: 'scholarship-terms-v3' })
  @IsString()
  @Length(1, 128)
  policyReference!: string;

  @ApiProperty({ example: '§7.2' })
  @IsString()
  @Length(1, 64)
  clause!: string;

  @ApiProperty({
    example:
      'Recipient withdrew before completing milestone 2; unearned tranche is repayable.',
  })
  @IsString()
  @Length(10, 2000)
  description!: string;
}

export class CreateRecoveryClaimDto {
  @ApiProperty({ description: 'Opaque recipient (student) id.' })
  @IsString()
  @Length(1, 128)
  recipientId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Fund recovered money returns to; null = pool.',
  })
  @IsOptional()
  @Matches(PROGRAM_ID_PATTERN)
  programId?: string | null;

  @ApiPropertyOptional({ description: 'Award / disbursement being recovered.' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  awardReference?: string;

  @ApiProperty({ type: AssetDto })
  @ValidateNested()
  @Type(() => AssetDto)
  asset!: AssetDto;

  @AmountMinorProperty()
  amountMinor!: number;

  @ApiProperty({ enum: RecoveryReason })
  @IsEnum(RecoveryReason)
  reason!: RecoveryReason;

  @ApiProperty({ type: LegalBasisDto })
  @ValidateNested()
  @Type(() => LegalBasisDto)
  legalBasis!: LegalBasisDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Evidence document ids / URIs (not the documents).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 512, { each: true })
  evidenceRefs?: string[];
}

export class RecordCollectionDto {
  @AmountMinorProperty()
  amountMinor!: number;

  @ApiProperty({
    enum: CollectionMethod,
    description: 'There is no wallet-debit method by design.',
  })
  @IsEnum(CollectionMethod)
  method!: CollectionMethod;

  @ApiProperty({
    description:
      'Proof of receipt (tx hash / bank ref). Unique per organization.',
  })
  @IsString()
  @Length(4, 128)
  externalReference!: string;

  @ApiPropertyOptional({
    description: 'Required for award_offset: reference to recipient consent.',
  })
  @IsOptional()
  @IsString()
  @Length(4, 256)
  recipientConsentRef?: string;

  @ApiProperty()
  @IsDateString()
  receivedAt!: string;
}

export class ListRecoveriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RecoveryStatus })
  @IsOptional()
  @IsEnum(RecoveryStatus)
  status?: RecoveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  recipientId?: string;
}
