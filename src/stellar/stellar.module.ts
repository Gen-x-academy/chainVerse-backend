import { Global, Module } from '@nestjs/common';
import { StellarService } from './stellar.service';

@Global()
@Module({
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
