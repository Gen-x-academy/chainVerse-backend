import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificateSocialSharingController } from './certificate-social-sharing.controller';
import { CertificateSocialSharingService } from './certificate-social-sharing.service';
import { CertificateTx, CertificateTxSchema } from '../stellar/schemas/certificate-tx.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CertificateTx.name, schema: CertificateTxSchema },
    ]),
  ],
  controllers: [CertificateSocialSharingController],
  providers: [CertificateSocialSharingService],
})
export class CertificateSocialSharingModule {}
