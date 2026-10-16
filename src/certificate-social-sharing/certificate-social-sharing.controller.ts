import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CertificateSocialSharingService } from './certificate-social-sharing.service';

@ApiTags('certificate-social-sharing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('certificates/social-sharing')
export class CertificateSocialSharingController {
  constructor(private readonly service: CertificateSocialSharingService) {}

  @Get(':certificateId/share-link')
  @ApiOperation({ summary: 'Generate LinkedIn and Open Graph share links for a certificate' })
  generateShareLink(@Param('certificateId') certificateId: string) {
    return this.service.generateShareLink(certificateId);
  }
}
