import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { DomainException } from '../common/errors/domain.exception';
import { NotificationService } from '../notification/notification.service';
import {
  AutoRenewalRun,
  AutoRenewalRunDocument,
} from './schemas/auto-renewal-run.schema';
import { Loan, LoanDocument, LoanStatus } from './schemas/loan.schema';
import { LibraryPolicyDocument } from './schemas/library-policy.schema';
import { LibraryPolicyService } from './library-policy.service';
import { LoansService } from './loans.service';
import { addDays, isDuplicateKeyError } from './e-library.util';

/**
 * Daily job that renews eligible loans ahead of their due date.
 *
 * Idempotency/locking: each loan is "claimed" for the day by inserting a
 * unique {@link AutoRenewalRun} ticket (loanId + runDate). A duplicate-key
 * error means another run (or another instance of this service, if ever
 * scaled horizontally) already claimed it — this run skips it rather than
 * renewing twice. There's no Redis/Bull lock in this codebase, so this
 * reuses the same Mongo unique-index claim pattern as
 * `IdempotencyService.save` instead of adding a new locking dependency.
 */
@Injectable()
export class AutoRenewalService {
  private readonly logger = new Logger(AutoRenewalService.name);

  constructor(
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectModel(AutoRenewalRun.name)
    private readonly runModel: Model<AutoRenewalRunDocument>,
    private readonly policyService: LibraryPolicyService,
    private readonly loansService: LoansService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run(): Promise<void> {
    const policy = await this.policyService.getPolicy();
    const now = new Date();
    const leadCutoff = addDays(now, policy.autoRenewalLeadDays);
    const runDate = now.toISOString().slice(0, 10);

    const candidates = await this.loanModel.find({
      status: LoanStatus.ACTIVE,
      autoRenewEnabled: true,
      dueDate: { $lte: leadCutoff },
    });

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Auto-renewal: evaluating ${candidates.length} loan(s) due within ${policy.autoRenewalLeadDays} day(s)`,
    );

    await Promise.allSettled(
      candidates.map((loan) => this.processLoan(loan, policy, runDate)),
    );
  }

  private async processLoan(
    loan: LoanDocument,
    policy: LibraryPolicyDocument,
    runDate: string,
  ): Promise<void> {
    const claimed = await this.claim(loan.id, runDate);
    if (!claimed) {
      return;
    }

    try {
      const renewed = await this.loansService.renewForAutoJob(loan, policy);
      await this.runModel.updateOne(
        { loanId: loan._id, runDate },
        { $set: { decision: 'renewed' } },
      );
      await this.notificationService.create({
        userId: loan.patronId,
        title: 'Loan renewed automatically',
        message: `Your loan was automatically renewed. New due date: ${renewed.dueDate.toDateString()}.`,
        type: 'library_auto_renewal',
        metadata: { loanId: loan.id, decision: 'renewed' },
      });
    } catch (error) {
      const reason =
        error instanceof DomainException
          ? error.message
          : 'Unexpected error during auto-renewal';
      await this.runModel.updateOne(
        { loanId: loan._id, runDate },
        { $set: { decision: 'declined', reason } },
      );
      await this.notificationService.create({
        userId: loan.patronId,
        title: 'Loan could not be renewed automatically',
        message: `We could not automatically renew your loan: ${reason}. Please renew manually or return the item.`,
        type: 'library_auto_renewal',
        metadata: { loanId: loan.id, decision: 'declined', reason },
      });
      this.logger.warn(`Auto-renewal declined for loan ${loan.id}: ${reason}`);
    }
  }

  private async claim(loanId: string, runDate: string): Promise<boolean> {
    try {
      await this.runModel.create({ loanId, runDate });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }
}
