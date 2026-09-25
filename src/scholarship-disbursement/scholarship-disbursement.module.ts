import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import { DisbursementAutomationController } from './controllers/disbursement-automation.controller';
import { PayoutWalletController } from './controllers/payout-wallet.controller';
import { ScholarshipAssetController } from './controllers/scholarship-asset.controller';
import { ScholarshipPaymentController } from './controllers/scholarship-payment.controller';
import { AutomationTokenGuard } from './guards/automation-token.guard';
import {
  DisbursementLedgerEntry,
  DisbursementLedgerEntrySchema,
} from './schemas/disbursement-ledger-entry.schema';
import {
  DisbursementLock,
  DisbursementLockSchema,
  DisbursementRun,
  DisbursementRunSchema,
} from './schemas/disbursement-run.schema';
import {
  PayoutWalletChallenge,
  PayoutWalletChallengeSchema,
} from './schemas/payout-wallet-challenge.schema';
import {
  PayoutWallet,
  PayoutWalletSchema,
} from './schemas/payout-wallet.schema';
import {
  ScholarshipAsset,
  ScholarshipAssetSchema,
} from './schemas/scholarship-asset.schema';
import {
  ScholarshipPayment,
  ScholarshipPaymentSchema,
} from './schemas/scholarship-payment.schema';
import { DisbursementExecutorService } from './services/disbursement-executor.service';
import { DisbursementLockService } from './services/disbursement-lock.service';
import { DisbursementReconcilerService } from './services/disbursement-reconciler.service';
import { DisbursementSchedulerService } from './services/disbursement-scheduler.service';
import { PayoutWalletService } from './services/payout-wallet.service';
import { ScholarshipAssetService } from './services/scholarship-asset.service';
import { ScholarshipPaymentService } from './services/scholarship-payment.service';
import { ScholarshipStellarGateway } from './stellar/scholarship-stellar.gateway';

/**
 * Scholarship disbursements: governed payout assets, verified payout wallets,
 * scheduled installments, batch execution on Stellar and evidence-based
 * reconciliation. StellarService comes from the global StellarModule, which
 * also registers ScheduleModule for the cron in DisbursementSchedulerService.
 * See docs/scholarships/disbursements.md.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipAsset.name, schema: ScholarshipAssetSchema },
      { name: PayoutWallet.name, schema: PayoutWalletSchema },
      { name: PayoutWalletChallenge.name, schema: PayoutWalletChallengeSchema },
      { name: ScholarshipPayment.name, schema: ScholarshipPaymentSchema },
      {
        name: DisbursementLedgerEntry.name,
        schema: DisbursementLedgerEntrySchema,
      },
      { name: DisbursementRun.name, schema: DisbursementRunSchema },
      { name: DisbursementLock.name, schema: DisbursementLockSchema },
      // Read by OrganizationRolesGuard and recipient membership checks.
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [
    ScholarshipAssetController,
    PayoutWalletController,
    ScholarshipPaymentController,
    DisbursementAutomationController,
  ],
  providers: [
    ScholarshipStellarGateway,
    ScholarshipAssetService,
    PayoutWalletService,
    ScholarshipPaymentService,
    DisbursementLockService,
    DisbursementExecutorService,
    DisbursementReconcilerService,
    DisbursementSchedulerService,
    OrganizationRolesGuard,
    AutomationTokenGuard,
  ],
})
export class ScholarshipDisbursementModule {}
