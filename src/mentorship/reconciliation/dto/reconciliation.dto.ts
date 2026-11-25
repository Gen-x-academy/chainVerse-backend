import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class InternalEntryDto {
  @ApiProperty() @IsString() @Length(1, 128) ref!: string;
  @ApiProperty({ enum: ['intent', 'hold', 'release', 'refund', 'fee'] })
  @IsIn(['intent', 'hold', 'release', 'refund', 'fee'])
  kind!: 'intent' | 'hold' | 'release' | 'refund' | 'fee';
  @ApiProperty() @IsInt() @Min(0) amountMinor!: number;
  @ApiProperty() @IsString() @Length(1, 16) currency!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 128) externalRef?: string;
}

export class ExternalTxDto {
  @ApiProperty() @IsString() @Length(1, 128) externalRef!: string;
  @ApiProperty() @IsInt() @Min(0) amountMinor!: number;
  @ApiProperty() @IsString() @Length(1, 16) currency!: string;
}

export class StartReconciliationRunDto {
  @ApiProperty({ description: 'Retries with the same key resume the same run.' })
  @IsString() @Length(8, 128) idempotencyKey!: string;
  @ApiProperty() @IsString() @Length(1, 64) periodLabel!: string;
  @ApiProperty({ type: [InternalEntryDto] })
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => InternalEntryDto)
  internal!: InternalEntryDto[];
  @ApiProperty({ type: [ExternalTxDto] })
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ExternalTxDto)
  external!: ExternalTxDto[];
}

export class ProposeCorrectionDto {
  @ApiProperty() @IsString() @Length(10, 1000) note!: string;
}

export class SignOffCorrectionDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
}
