import { Global, Module } from '@nestjs/common';
import { StellarService } from './stellar.service';

@Global()
@Module({
  controllers: [StellarController],
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
