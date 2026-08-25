import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Loan, LoanSchema } from './schemas/loan.schema';
import {
  ChargePolicy,
  ChargePolicySchema,
} from './schemas/charge-policy.schema';
import { LedgerEntry, LedgerEntrySchema } from './schemas/ledger-entry.schema';
import {
  PatronBalance,
  PatronBalanceSchema,
} from './schemas/patron-balance.schema';
import {
  WaiverRequest,
  WaiverRequestSchema,
} from './schemas/waiver-request.schema';
import {
  SchedulerJobRun,
  SchedulerJobRunSchema,
} from './schemas/scheduler-job-run.schema';
import { IdempotencyModule } from '../idempotency/idempotency.module';

import { LoanService } from './services/loan.service';
import { ChargePolicyService } from './services/charge-policy.service';
import { FineCalculationService } from './services/fine-calculation.service';
import { LedgerService } from './services/ledger.service';
import { WaiverService } from './services/waiver.service';
import { OverdueSchedulerService } from './services/overdue-scheduler.service';

import { LoansController } from './controllers/loans.controller';
import { LedgerController } from './controllers/ledger.controller';
import { ChargePolicyController } from './controllers/charge-policy.controller';
import { FinesController } from './controllers/fines.controller';
import { WaiverController } from './controllers/waiver.controller';
import { OverdueController } from './controllers/overdue.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Loan.name, schema: LoanSchema },
      { name: ChargePolicy.name, schema: ChargePolicySchema },
      { name: LedgerEntry.name, schema: LedgerEntrySchema },
      { name: PatronBalance.name, schema: PatronBalanceSchema },
      { name: WaiverRequest.name, schema: WaiverRequestSchema },
      { name: SchedulerJobRun.name, schema: SchedulerJobRunSchema },
    ]),
    IdempotencyModule,
  ],
  controllers: [
    LoansController,
    LedgerController,
    ChargePolicyController,
    FinesController,
    WaiverController,
    OverdueController,
  ],
  providers: [
    LoanService,
    ChargePolicyService,
    FineCalculationService,
    LedgerService,
    WaiverService,
    OverdueSchedulerService,
  ],
  exports: [LedgerService, ChargePolicyService, FineCalculationService],
})
export class ELibraryModule {}
