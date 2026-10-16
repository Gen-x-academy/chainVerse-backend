import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from './common/organization-membership.schema';
import { TenantAccessService } from './common/tenant-access.service';
import { HorizonClient } from './integrations/horizon.client';
import {
  ScholarshipFinanceJobs,
  ScholarshipFinanceSchedulers,
} from './jobs/scholarship-finance.jobs';
import { LedgerEntry, LedgerEntrySchema } from './ledger/ledger-entry.schema';
import { LedgerQueryService } from './ledger/ledger-query.service';
import { ProgramLedgerController } from './ledger/ledger.controller';
import { ProgramLedgerService } from './ledger/ledger.service';
import {
  PayoutIntent,
  PayoutIntentSchema,
} from './payouts/payout-intent.schema';
import {
  PayoutsController,
  PayoutSignerController,
} from './payouts/payouts.controller';
import { PayoutsService } from './payouts/payouts.service';
import {
  ScholarshipProgram,
  ScholarshipProgramSchema,
} from './programs/scholarship-program.schema';
import { ScholarshipProgramController } from './programs/scholarship-program.controller';
import { ScholarshipProgramService } from './programs/scholarship-program.service';
import {
  PaymentReceipt,
  PaymentReceiptSchema,
} from './receipts/payment-receipt.schema';
import {
  OrganizationReceiptsController,
  ReceiptsController,
} from './receipts/receipts.controller';
import { ReceiptsService } from './receipts/receipts.service';
import { ReconciliationAlertsService } from './reconciliation/reconciliation-alerts.service';
import {
  ReconciliationAlertsController,
  ReconciliationController,
} from './reconciliation/reconciliation.controller';
import {
  ReconciliationAlert,
  ReconciliationAlertSchema,
  ReconciliationRun,
  ReconciliationRunSchema,
} from './reconciliation/reconciliation.schemas';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { SolvencyGuardService } from './reconciliation/solvency-guard.service';
import { FeeSchedulesController } from './controllers/fee-schedules.controller';
import { FundingController } from './controllers/funding.controller';
import {
  FinanceJobsController,
  FinanceLedgerController,
} from './controllers/ledger.controller';
import { RecoveriesController } from './controllers/recoveries.controller';
import { RefundsController } from './controllers/refunds.controller';
import { FinanceAccessGuard } from './guards/finance-access.guard';
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
import { FinanceDashboardService } from './dashboard/finance-dashboard.service';
import { FinanceDashboardController } from './dashboard/finance-dashboard.controller';

/**
 * Scholarship finance (#1247).
 *
 * One module owning the treasury aggregate:
 *
 *  - **Program treasury** — `ScholarshipProgram` (asset, network, treasury
 *    account, ledger lock) plus its double-entry `LedgerEntry` records.
 *  - **Funding** — `FundingRound`, `SponsorDeposit`, `AllocationChange`.
 *  - **Payouts & receipts** — `PayoutIntent` with controlled failure recovery,
 *    and the recipient `PaymentReceipt`.
 *  - **Reconciliation** — `ReconciliationRun` / `ReconciliationAlert`, plus
 *    `LedgerBalance`, `LedgerJournal` and `FinanceAuditEvent`.
 *  - **Refunds & recoveries** — `Refund`, `RecoveryClaim`, `RecoveryCollection`.
 *  - **Fees** — `FeeSchedule`.
 *
 * Ownership was ambiguous before: two classes were each named `LedgerService`
 * and two `LedgerController`, and the file carried duplicate imports, duplicate
 * `@Module` keys and an unterminated block comment that swallowed ~50 lines of
 * imports. The names are now unique and the ownership is explicit:
 *
 *  | Aggregate | Owner |
 *  | --- | --- |
 *  | double-entry journal, balances, integrity, audit | `services/ledger.service` → `LedgerService` |
 *  | per-program entry posting | `ledger/ledger.service` → `ProgramLedgerService` |
 *  | org-level ledger/audit read view | `controllers/ledger.controller` → `FinanceLedgerController` |
 *  | per-program entry read view | `ledger/ledger.controller` → `ProgramLedgerController` |
 *
 * See docs/adr/0001-scholarship-bounded-contexts.md and
 * docs/scholarships/scholarship-finance-consolidation.md.
 */
@Module({
  imports: [
    IdempotencyModule,
    MongooseModule.forFeature([
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: LedgerEntry.name, schema: LedgerEntrySchema },
      { name: PayoutIntent.name, schema: PayoutIntentSchema },
      { name: PaymentReceipt.name, schema: PaymentReceiptSchema },
      { name: ReconciliationRun.name, schema: ReconciliationRunSchema },
      { name: ReconciliationAlert.name, schema: ReconciliationAlertSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
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
    ScholarshipProgramController,
    FinanceLedgerController,
    ProgramLedgerController,
    PayoutsController,
    PayoutSignerController,
    ReceiptsController,
    OrganizationReceiptsController,
    ReconciliationController,
    ReconciliationAlertsController,
    FeeSchedulesController,
    FundingController,
    RefundsController,
    RecoveriesController,
    FinanceJobsController,
    FinanceDashboardController,
  ],
  providers: [
    FinanceAccessGuard,
    TenantAccessService,
    HorizonClient,
    ScholarshipProgramService,
    LedgerService,
    ProgramLedgerService,
    LedgerQueryService,
    ReconciliationAlertsService,
    ReconciliationService,
    SolvencyGuardService,
    ReceiptsService,
    PayoutsService,
    FinanceAuditService,
    FeeService,
    FundingService,
    RefundService,
    RecoveryService,
    ScholarshipFinanceJobs,
    ScholarshipFinanceSchedulers,
    FinanceDashboardService,
  ],
  exports: [
    LedgerService,
    ProgramLedgerService,
    LedgerQueryService,
    SolvencyGuardService,
    ReceiptsService,
    FeeService,
  ],
})
export class ScholarshipFinanceModule {}
