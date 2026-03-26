import { Module } from '@nestjs/common';
import { FinancialAidController } from './financial-aid.controller';
import { FinancialAidApplicationRepository } from './domain/financial-aid-application.repository';
import { InMemoryFinancialAidApplicationRepository } from './infrastructure/in-memory-financial-aid-application.repository';
import { ApplyForFinancialAidUseCase } from './use-cases/apply-for-financial-aid.use-case';
import { FindFinancialAidApplicationsUseCase } from './use-cases/find-financial-aid-applications.use-case';
import { ReviewFinancialAidApplicationUseCase } from './use-cases/review-financial-aid-application.use-case';
import { DeleteFinancialAidApplicationUseCase } from './use-cases/delete-financial-aid-application.use-case';

/**
 * To swap persistence layers (e.g. switch to MongoDB), replace the
 * `useClass` below with a MongoFinancialAidApplicationRepository — no
 * other file needs to change.
 */
@Module({
  controllers: [FinancialAidController],
  providers: [
    {
      provide: FinancialAidApplicationRepository,
      useClass: InMemoryFinancialAidApplicationRepository,
    },
    ApplyForFinancialAidUseCase,
    FindFinancialAidApplicationsUseCase,
    ReviewFinancialAidApplicationUseCase,
    DeleteFinancialAidApplicationUseCase,
  ],
})
export class FinancialAidModule {}
