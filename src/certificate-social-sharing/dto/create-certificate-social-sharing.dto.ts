import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCertificateSocialSharingDto {
  @ApiProperty({ description: 'The certificate ID to generate share links for' })
  @IsString()
  certificateId: string;
}
