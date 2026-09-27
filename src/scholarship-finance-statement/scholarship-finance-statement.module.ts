import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import {
  FinanceStatement,
  FinanceStatementSchema,
} from './schemas/finance-statement.schema';
import {
  LedgerJournal,
  LedgerJournalSchema,
} from '../scholarship-finance/schemas/ledger-journal.schema';
import {
  SponsorDeposit,
  SponsorDepositSchema,
} from '../scholarship-finance/schemas/sponsor-deposit.schema';
import { Refund, RefundSchema } from '../scholarship-finance/schemas/refund.schema';
import {
  RecoveryClaim,
  RecoveryClaimSchema,
} from '../scholarship-finance/schemas/recovery-claim.schema';
import {
  BudgetReservation,
  BudgetReservationSchema,
} from '../scholarships/schemas/budget-reservation.schema';
import { ScholarshipFinanceStatementService } from './scholarship-finance-statement.service';
import { ScholarshipFinanceStatementController } from './scholarship-finance-statement.controller';
import { ScholarshipFinanceStatementJobs } from './jobs/finance-statement.jobs';

/**
 * ScholarshipFinanceStatementModule
 *
 * Produces period finance statements reconciling all financial events:
 *   - Sponsor deposits and fees (contributions)
 *   - Budget reservations (commitments / award disbursements)
 *   - Refunds (returned payments)
 *   - Recovery collections (clawbacks)
 *   - Ledger journal reversals
 *
 * Generation modes:
 *   - Inline (synchronous) for periods ≤ 500 line items → immediate READY response.
 *   - Async (PENDING → RUNNING → READY) for larger ranges, driven by
 *     ScholarshipFinanceStatementJobs (runs every 2 minutes).
 *
 * Expiry:
 *   READY statements are retained for 30 days. ScholarshipFinanceStatementJobs
 *   sets status = EXPIRED and clears lineItems daily at 02:00 UTC.
 *
 * Ownership: OWNER and ADMIN organisation roles.
 * Privacy: no applicant identity; financial amounts only.
 * Migration: new collection `scholarship_finance_statements`.
 *   All other collections read here are owned by their respective modules.
 * Operational impact:
 *   - Async jobs use ScheduleModule (registered globally by ScheduleModule.forRoot()).
 *   - Maximum 10 PENDING statements processed per 2-minute cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      // New collection owned by this module.
      { name: FinanceStatement.name, schema: FinanceStatementSchema },
      // Read references from existing modules.
      { name: LedgerJournal.name, schema: LedgerJournalSchema },
      { name: SponsorDeposit.name, schema: SponsorDepositSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: RecoveryClaim.name, schema: RecoveryClaimSchema },
      { name: BudgetReservation.name, schema: BudgetReservationSchema },
    ]),
  ],
  controllers: [ScholarshipFinanceStatementController],
  providers: [
    ScholarshipFinanceStatementService,
    ScholarshipFinanceStatementJobs,
    OrganizationRolesGuard,
  ],
  exports: [ScholarshipFinanceStatementService],
})
export class ScholarshipFinanceStatementModule {}
