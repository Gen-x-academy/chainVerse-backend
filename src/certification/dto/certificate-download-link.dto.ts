import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CertificateDownloadLinkDto {
  @ApiProperty({
    description:
      'Absolute URL to download the certificate. Requires the embedded token query parameter.',
    example:
      'http://localhost:3000/api/v1/certification/cert-abc/download?token=eyJhbGci...',
  })
  @IsString()
  @IsUrl({ require_tld: false })
  downloadUrl!: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the download token expires.',
    example: '2026-08-24T12:00:00.000Z',
  })
  @IsString()
  @IsDateString()
  expiresAt!: string;

  @ApiProperty({
    description: 'Seconds until the download token expires.',
    example: 3600,
  })
  @IsNumber()
  @Min(0)
  expiresIn!: number;
}
