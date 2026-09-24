import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from './common/organization-membership.schema';
import { TenantAccessService } from './common/tenant-access.service';
import { HorizonClient } from './integrations/horizon.client';
import { ScholarshipFinanceJobs } from './jobs/scholarship-finance.jobs';
import { LedgerEntry, LedgerEntrySchema } from './ledger/ledger-entry.schema';
import { LedgerQueryService } from './ledger/ledger-query.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerService } from './ledger/ledger.service';
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

/**
 * Scholarship finance: per-program double-entry ledgers, payout intents with
 * controlled failure recovery, recipient receipts, and treasury reconciliation.
 * See docs/scholarship-finance.md.
 */
@Module({
  imports: [
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
    ]),
  ],
  controllers: [
    ScholarshipProgramController,
    LedgerController,
    PayoutsController,
    PayoutSignerController,
    ReceiptsController,
    OrganizationReceiptsController,
    ReconciliationController,
    ReconciliationAlertsController,
  ],
  providers: [
    TenantAccessService,
    HorizonClient,
    ScholarshipProgramService,
    LedgerQueryService,
    LedgerService,
    ReconciliationAlertsService,
    ReconciliationService,
    SolvencyGuardService,
    ReceiptsService,
    PayoutsService,
    ScholarshipFinanceJobs,
  ],
  exports: [
    LedgerService,
    LedgerQueryService,
    SolvencyGuardService,
    ReceiptsService,
  ],
})
export class ScholarshipFinanceModule {}
