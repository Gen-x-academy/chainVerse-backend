import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinancialAidController } from './financial-aid.controller';
import { FinancialAidService } from './financial-aid.service';
import {
  FinancialAid,
  FinancialAidSchema,
} from './schemas/financial-aid.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinancialAid.name, schema: FinancialAidSchema },
    ]),
  ],
  controllers: [FinancialAidController],
  providers: [FinancialAidService],
})
export class FinancialAidModule {}
