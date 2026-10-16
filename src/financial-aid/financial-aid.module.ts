import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinancialAidController } from './financial-aid.controller';
import {
  FinancialAid,
  FinancialAidSchema,
} from './schemas/financial-aid.schema';
import { FinancialAidApplicationRepository } from './domain/financial-aid-application.repository';
import { MongooseFinancialAidApplicationRepository } from './infrastructure/mongoose-financial-aid-application.repository';
import { ApplyForFinancialAidUseCase } from './use-cases/apply-for-financial-aid.use-case';
import { FindFinancialAidApplicationsUseCase } from './use-cases/find-financial-aid-applications.use-case';
import { ReviewFinancialAidApplicationUseCase } from './use-cases/review-financial-aid-application.use-case';
import { DeleteFinancialAidApplicationUseCase } from './use-cases/delete-financial-aid-application.use-case';

/**
 * To swap persistence layers, replace MongooseFinancialAidApplicationRepository
 * with any other class that extends FinancialAidApplicationRepository — no
 * controller, use-case, or domain file needs to change.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinancialAid.name, schema: FinancialAidSchema },
    ]),
  ],
  controllers: [FinancialAidController],
  providers: [
    {
      provide: FinancialAidApplicationRepository,
      useClass: MongooseFinancialAidApplicationRepository,
    },
    ApplyForFinancialAidUseCase,
    FindFinancialAidApplicationsUseCase,
    ReviewFinancialAidApplicationUseCase,
    DeleteFinancialAidApplicationUseCase,
  ],
})
export class FinancialAidModule {}
