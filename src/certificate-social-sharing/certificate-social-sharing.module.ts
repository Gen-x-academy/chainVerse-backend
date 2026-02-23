import { Module } from '@nestjs/common';
import { CertificateSocialSharingController } from './certificate-social-sharing.controller';
import { CertificateSocialSharingService } from './certificate-social-sharing.service';

@Module({
  controllers: [CertificateSocialSharingController],
  providers: [CertificateSocialSharingService],
})
export class CertificateSocialSharingModule {}
