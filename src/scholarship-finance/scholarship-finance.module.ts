import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { FeeSchedulesController } from './controllers/fee-schedules.controller';
import { FundingController } from './controllers/funding.controller';
import {
  FinanceJobsController,
  LedgerController,
} from './controllers/ledger.controller';
import { RecoveriesController } from './controllers/recoveries.controller';
import { RefundsController } from './controllers/refunds.controller';
import { FinanceAccessGuard } from './guards/finance-access.guard';
import { ScholarshipFinanceJobs } from './jobs/scholarship-finance.jobs';
import {
  AllocationChange,
  AllocationChangeSchema,
} from './schemas/allocation-change.schema';
import { FeeSchedule, FeeScheduleSchema } from './schemas/fee-schedule.schema';
import {
  FinanceAuditEvent,
  FinanceAuditEventSchema,
} from './schemas/finance-audit-event.schema';
import {
  FundingRound,
  FundingRoundSchema,
} from './schemas/funding-round.schema';
import {
  LedgerBalance,
  LedgerBalanceSchema,
} from './schemas/ledger-balance.schema';
import {
  LedgerJournal,
  LedgerJournalSchema,
} from './schemas/ledger-journal.schema';
import {
  RecoveryClaim,
  RecoveryClaimSchema,
} from './schemas/recovery-claim.schema';
import {
  RecoveryCollection,
  RecoveryCollectionSchema,
} from './schemas/recovery-collection.schema';
import { Refund, RefundSchema } from './schemas/refund.schema';
import {
  SponsorDeposit,
  SponsorDepositSchema,
} from './schemas/sponsor-deposit.schema';
import { FeeService } from './services/fee.service';
import { FinanceAuditService } from './services/finance-audit.service';
import { FundingService } from './services/funding.service';
import { LedgerService } from './services/ledger.service';
import { RecoveryService } from './services/recovery.service';
import { RefundService } from './services/refund.service';

/**
 * Scholarship finance: sponsor deposits & funding rounds, versioned fees,
 * refunds / returned payments, and recoveries / clawbacks — all posting to
 * one append-only double-entry ledger scoped per organization (tenant).
 * See docs/scholarship-finance.md.
 */
@Module({
  imports: [
    IdempotencyModule,
    MongooseModule.forFeature([
      { name: LedgerJournal.name, schema: LedgerJournalSchema },
      { name: LedgerBalance.name, schema: LedgerBalanceSchema },
      { name: FinanceAuditEvent.name, schema: FinanceAuditEventSchema },
      { name: FeeSchedule.name, schema: FeeScheduleSchema },
      { name: FundingRound.name, schema: FundingRoundSchema },
      { name: SponsorDeposit.name, schema: SponsorDepositSchema },
      { name: AllocationChange.name, schema: AllocationChangeSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: RecoveryClaim.name, schema: RecoveryClaimSchema },
      { name: RecoveryCollection.name, schema: RecoveryCollectionSchema },
    ]),
  ],
  controllers: [
    FeeSchedulesController,
    FundingController,
    RefundsController,
    RecoveriesController,
    LedgerController,
    FinanceJobsController,
  ],
  providers: [
    FinanceAccessGuard,
    LedgerService,
    FinanceAuditService,
    FeeService,
    FundingService,
    RefundService,
    RecoveryService,
    ScholarshipFinanceJobs,
  ],
  exports: [LedgerService, FeeService],
})
export class ScholarshipFinanceModule {}
