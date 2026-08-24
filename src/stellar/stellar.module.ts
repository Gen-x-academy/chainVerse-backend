import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { StellarSyncService } from './stellar-sync.service';
import {
  CertificateTx,
  CertificateTxSchema,
} from './schemas/certificate-tx.schema';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: CertificateTx.name, schema: CertificateTxSchema },
    ]),
  ],
  controllers: [StellarController],
  providers: [StellarService, StellarSyncService],
  exports: [StellarService, StellarSyncService],
})
export class StellarModule {}
