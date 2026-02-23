import { Module } from '@nestjs/common';
import { AdminCertificateNameChangeReviewController } from './admin-certificate-name-change-review.controller';
import { AdminCertificateNameChangeReviewService } from './admin-certificate-name-change-review.service';

@Module({
  controllers: [AdminCertificateNameChangeReviewController],
  providers: [AdminCertificateNameChangeReviewService],
})
export class AdminCertificateNameChangeReviewModule {}
