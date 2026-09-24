import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IntegrityJobStatus,
} from '../schemas/integrity-job.schema';
import {
  RenditionIntegrityStatus,
} from '../schemas/rendition-integrity.schema';

export class RegisterChecksumDto {
  @ApiProperty({ description: 'Edition the rendition belongs to' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  editionId: string;

  @ApiProperty({ description: 'Rendition (format/file) identifier' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  renditionId: string;

  @ApiProperty({
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    description: 'Recorded SHA-256 hex digest of the stored file',
  })
  @Matches(/^[0-9a-fA-F]{64}$/i, { message: 'sha256 must be a 64-character hex digest' })
  sha256: string;

  @ApiProperty({ description: 'Recorded size of the stored file in bytes' })
  @IsNumber()
  @Min(1)
  sizeBytes: number;
}

export class VerifyJobOptionsDto {
  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 1000,
    description: 'Maximum number of renditions verified in one pass (bounds the job)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  batchSize?: number = 50;
}

export class QuarantineRenditionDto {
  @ApiProperty({ description: 'Why the rendition is being quarantined' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export enum IntegrityResolution {
  CONFIRMED = 'confirmed',
  RESEEDED = 'reseeded',
}

export class ResolveQuarantineDto {
  @ApiProperty({
    enum: IntegrityResolution,
    description:
      'confirmed: the stored file is the intended copy; reseeded: a corrected checksum was recorded',
  })
  @IsEnum(IntegrityResolution)
  resolution: IntegrityResolution;

  @ApiPropertyOptional({
    description: 'Corrected SHA-256 if resolution is reseeded',
  })
  @IsOptional()
  @Matches(/^[0-9a-fA-F]{64}$/i, { message: 'sha256 must be a 64-character hex digest' })
  newSha256?: string;
}

export class IntegrityRenditionQueryDto {
  @ApiPropertyOptional({ enum: RenditionIntegrityStatus })
  @IsOptional()
  @IsEnum(RenditionIntegrityStatus)
  status?: RenditionIntegrityStatus;

  @ApiPropertyOptional({ description: 'Filter by edition' })
  @IsOptional()
  @IsString()
  editionId?: string;

  @ApiPropertyOptional({ description: 'Filter by rendition' })
  @IsOptional()
  @IsString()
  renditionId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

export class IntegrityJobQueryDto {
  @ApiPropertyOptional({ enum: IntegrityJobStatus })
  @IsOptional()
  @IsEnum(IntegrityJobStatus)
  status?: IntegrityJobStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}