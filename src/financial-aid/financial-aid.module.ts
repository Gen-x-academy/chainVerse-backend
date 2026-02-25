import { Module } from '@nestjs/common';
import { FinancialAidController } from './financial-aid.controller';
import { FinancialAidService } from './financial-aid.service';

@Module({
  controllers: [FinancialAidController],
  providers: [FinancialAidService],
})
export class FinancialAidModule {}
