import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Partial update of a certificate social-sharing configuration.
 *
 * Every field is optional so the DTO can patch a single attribute, but the
 * values that are supplied are still fully validated by the global
 * ValidationPipe (whitelist + forbidNonWhitelisted + transform).
 */
export class UpdateCertificateSocialSharingDto {
  @ApiPropertyOptional({
    description: 'Public title shown on the shared certificate card',
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Optional description shown beneath the shared title',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON metadata; keys must stay client-safe',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
