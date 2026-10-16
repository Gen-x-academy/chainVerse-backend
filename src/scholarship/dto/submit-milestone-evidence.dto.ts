import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EvidenceType } from '../scholarship.constants';

export class EvidenceDocumentReferenceDto {
  @ApiProperty({
    description: 'Opaque storage key of an already-uploaded, scanned file',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  storageKey!: string;

  @ApiProperty({ description: 'Hex SHA-256 of the file contents' })
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'sha256 must be 64 lower-case hex chars',
  })
  sha256!: string;
}

/**
 * Evidence body. Everything except `submissionKey` and `evidenceType` is
 * encrypted at rest. Callers should send references and minimal facts, not raw
 * documents or unnecessary personal data.
 */
export class SubmitMilestoneEvidenceDto {
  @ApiProperty({
    description:
      'Client-generated idempotency key; retries must reuse it with the same content',
    example: '9f1c2a7e-3b0d-4f55-9d34-5f1b2c3d4e5f',
  })
  @Matches(/^[A-Za-z0-9._:-]{8,128}$/, {
    message: 'submissionKey must be 8–128 chars of [A-Za-z0-9._:-]',
  })
  submissionKey!: string;

  @ApiProperty({ enum: EvidenceType })
  @IsEnum(EvidenceType)
  evidenceType!: EvidenceType;

  @ApiPropertyOptional({
    description:
      'Minimal structured facts (encrypted at rest, max 8 KB serialized)',
    example: { term: '2027-spring', attendanceRate: 0.92 },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [EvidenceDocumentReferenceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EvidenceDocumentReferenceDto)
  documentReferences?: EvidenceDocumentReferenceDto[];
}
