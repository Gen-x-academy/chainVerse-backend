import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { StellarSyncService, CertificateTx, CertificateTxSchema } from './stellar-sync.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CertificateTx.name, schema: CertificateTxSchema },
    ]),
  ],
  controllers: [StellarController],
  providers: [StellarService, StellarSyncService],
  exports: [StellarService],
})
export class StellarModule {}
