import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOfflineGrantDto {
  @ApiProperty({ description: 'Active digital loan the grant is bound to' })
  @IsMongoId()
  loanId: string;

  @ApiProperty({ description: 'Rendition (format/file) the grant authorizes' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  renditionId: string;

  @ApiProperty({
    description:
      'Opaque device identifier. Only a SHA-256 hash of this value is stored.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(512)
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Maximum number of devices that may hold an active grant for this loan/rendition.',
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  allowedDeviceCount?: number;

  @ApiPropertyOptional({
    description:
      'Optional grant expiry (ISO-8601). Must not exceed the loan expiry; defaults to the loan expiry.',
  })
  @IsDateString()
  expiresAt?: string;
}

export class VerifyOfflineDownloadDto {
  @ApiProperty({ description: 'Opaque capability token issued when the grant was created' })
  @IsString()
  @IsNotEmpty()
  grantToken: string;

  @ApiProperty({
    description:
      'The same opaque device identifier provided at grant creation. Only a SHA-256 hash is stored and compared.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(512)
  deviceId: string;
}