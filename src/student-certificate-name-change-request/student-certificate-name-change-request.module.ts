import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CertificateNameChangeRequest,
  CertificateNameChangeRequestSchema,
} from './schemas/certificate-name-change-request.schema';
import { StudentCertificateNameChangeRequestController } from './student-certificate-name-change-request.controller';
import { StudentCertificateNameChangeRequestService } from './student-certificate-name-change-request.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CertificateNameChangeRequest.name,
        schema: CertificateNameChangeRequestSchema,
      },
    ]),
  ],
  controllers: [StudentCertificateNameChangeRequestController],
  providers: [StudentCertificateNameChangeRequestService],
  exports: [StudentCertificateNameChangeRequestService],
})
export class StudentCertificateNameChangeRequestModule {}
