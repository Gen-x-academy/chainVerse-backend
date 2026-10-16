import { ApiProperty } from '@nestjs/swagger';

export class RenditionAccessTokenResponseDto {
  @ApiProperty({
    description: 'Opaque single-use bearer token. Never persisted in plaintext.',
  })
  token!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: ['read', 'download'] })
  purpose!: string;

  @ApiProperty({ example: '/api/digital-renditions/6e5c.../content?token=...' })
  accessUrl!: string;
}
