import { Module } from '@nestjs/common';
import { StudentCertificateNameChangeRequestController } from './student-certificate-name-change-request.controller';
import { StudentCertificateNameChangeRequestService } from './student-certificate-name-change-request.service';

@Module({
  controllers: [StudentCertificateNameChangeRequestController],
  providers: [StudentCertificateNameChangeRequestService],
})
export class StudentCertificateNameChangeRequestModule {}
