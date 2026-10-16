import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import {
  SchedulerJobRun,
  SchedulerJobRunDocument,
} from '../schemas/scheduler-job-run.schema';
import { LoanStatus } from '../enums/loan-status.enum';
import { ChargeType } from '../enums/charge-type.enum';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { ChargePolicyService } from './charge-policy.service';
import { FineCalculationService } from './fine-calculation.service';
import { LedgerService } from './ledger.service';
import {
  DEFAULT_CURRENCY,
  OVERDUE_JOB_BATCH_SIZE,
  OVERDUE_JOB_MAX_BATCHES,
} from '../e-library.constants';

export interface JobRunSummary {
  jobName: string;
  scanned: number;
  transitioned: number;
  errors: number;
}

// Transitions ACTIVE loans past their due date into OVERDUE status, and
// posts the resulting overdue fine via the policy-driven calculation
// engine. Runs on a schedule but every entry point is idempotent and safe
// to re-run (e.g. after a crash, or via the manual reconciliation trigger),
// because the query filter (`status: ACTIVE`) makes each transition happen
// at most once regardless of how many times the job scans the same loan.
@Injectable()
export class OverdueSchedulerService {
  private readonly logger = new Logger(OverdueSchedulerService.name);
  private isRunning = false;

  constructor(
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectModel(SchedulerJobRun.name)
    private readonly jobRunModel: Model<SchedulerJobRunDocument>,
    private readonly chargePolicyService: ChargePolicyService,
    private readonly fineCalculationService: FineCalculationService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'e-library-overdue-transition' })
  async handleOverdueTransition(): Promise<void> {
    await this.runJob('overdue-transition');
  }

  // A slower-cadence safety net that re-runs the exact same idempotent
  // query, catching anything a missed/failed hourly run left behind.
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'e-library-overdue-reconciliation',
  })
  async handleReconciliation(): Promise<void> {
    await this.runJob('overdue-reconciliation');
  }

  async runJob(jobName: string): Promise<JobRunSummary> {
    if (this.isRunning) {
      this.logger.warn(`Skipping ${jobName}: a run is already in progress`);
      return { jobName, scanned: 0, transitioned: 0, errors: 0 };
    }

    this.isRunning = true;
    const startedAt = new Date();
    const jobRun = await this.jobRunModel.create({
      jobName,
      startedAt,
      status: 'running',
    });

    let scanned = 0;
    let transitioned = 0;
    let errors = 0;

    try {
      const now = new Date();

      for (let batch = 0; batch < OVERDUE_JOB_MAX_BATCHES; batch++) {
        const candidates = await this.loanModel
          .find({ status: LoanStatus.ACTIVE, dueDate: { $lte: now } })
          .select('_id')
          .limit(OVERDUE_JOB_BATCH_SIZE)
          .lean();

        if (candidates.length === 0) break;
        scanned += candidates.length;

        for (const candidate of candidates) {
          try {
            const transitionedLoan = await this.transitionLoan(
              candidate._id.toString(),
              now,
            );
            if (transitionedLoan) transitioned++;
          } catch (err) {
            errors++;
            this.logger.error(
              `Failed to transition loan ${candidate._id.toString()} to overdue: ${(err as Error).message}`,
            );
          }
        }

        if (candidates.length < OVERDUE_JOB_BATCH_SIZE) break;
      }

      await this.jobRunModel.updateOne(
        { _id: jobRun._id },
        {
          $set: {
            completedAt: new Date(),
            scannedCount: scanned,
            transitionedCount: transitioned,
            errorCount: errors,
            status: 'completed',
          },
        },
      );
    } catch (err) {
      await this.jobRunModel.updateOne(
        { _id: jobRun._id },
        {
          $set: {
            completedAt: new Date(),
            scannedCount: scanned,
            transitionedCount: transitioned,
            errorCount: errors,
            status: 'failed',
            errorMessage: (err as Error).message,
          },
        },
      );
      this.isRunning = false;
      throw err;
    }

    this.isRunning = false;
    return { jobName, scanned, transitioned, errors };
  }

  // Atomically claims a single loan for transition (the `status: ACTIVE`
  // filter is what makes this safe against concurrent job instances and
  // safe to retry), then, only on a successful claim, prices and posts the
  // overdue fine for it.
  private async transitionLoan(loanId: string, now: Date): Promise<boolean> {
    const claimed = await this.loanModel.findOneAndUpdate(
      { _id: loanId, status: LoanStatus.ACTIVE },
      { $set: { status: LoanStatus.OVERDUE, lastOverdueCheckAt: now } },
      { new: true },
    );

    if (!claimed) return false;

    const policy = await this.chargePolicyService.getEffectivePolicy(
      ChargeType.OVERDUE_FINE,
      DEFAULT_CURRENCY,
      now,
    );

    const fine = this.fineCalculationService.calculate(claimed, policy, now);

    if (fine.amountMinorUnits > 0) {
      await this.ledgerService.postEntry({
        patronId: claimed.patronId,
        loanId: claimed.id,
        entryType: LedgerEntryType.OVERDUE_FINE,
        amountMinorUnits: fine.amountMinorUnits,
        currency: fine.currency,
        reason: `Overdue fine: ${fine.overdueDays} day(s) overdue, ${fine.chargeableDays} chargeable after ${fine.graceDays}-day grace period`,
        createdBy: 'system:overdue-scheduler',
        metadata: { policyId: policy.id, ...fine },
      });
    }

    return true;
  }

  async getRecentRuns(
    jobName?: string,
    limit = 20,
  ): Promise<SchedulerJobRunDocument[]> {
    const filter = jobName ? { jobName } : {};
    return this.jobRunModel
      .find(filter)
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
  }
}
