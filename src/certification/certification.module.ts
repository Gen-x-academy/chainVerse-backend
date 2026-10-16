import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CertificateTx,
  CertificateTxSchema,
} from '../stellar/schemas/certificate-tx.schema';
import { SessionModule } from '../session/session.module';
import { CertificationController } from './certification.controller';
import { CertificationService } from './certification.service';

@Module({
  imports: [
    SessionModule,
    MongooseModule.forFeature([
      { name: CertificateTx.name, schema: CertificateTxSchema },
    ]),
  ],
  controllers: [CertificationController],
  providers: [CertificationService],
  exports: [CertificationService],
})
export class CertificationModule {}
