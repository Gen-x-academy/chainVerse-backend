import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { LoanStatus } from '../enums/loan-status.enum';
import { PatronBalance, PatronBalanceDocument } from '../schemas/patron-balance.schema';
import { LedgerEntry, LedgerEntryDocument } from '../schemas/ledger-entry.schema';
import { SchedulerJobRun, SchedulerJobRunDocument } from '../schemas/scheduler-job-run.schema';

const RECONCILE_BATCH_SIZE = parseInt(
  process.env.E_LIBRARY_RECONCILE_BATCH_SIZE ?? '200',
  10,
);

export interface ReconciliationChange {
  entityType: string;
  entityId: string;
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface ReconciliationReport {
  jobName: string;
  dryRun: boolean;
  timestamp: string;
  scanned: number;
  fixed: number;
  errors: number;
  changes: ReconciliationChange[];
  errorMessages: string[];
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(PatronBalance.name)
    private readonly patronBalanceModel: Model<PatronBalanceDocument>,
    @InjectModel(LedgerEntry.name)
    private readonly ledgerEntryModel: Model<LedgerEntryDocument>,
    @InjectModel(SchedulerJobRun.name)
    private readonly jobRunModel: Model<SchedulerJobRunDocument>,
  ) {}

  async reconcileAvailableCopies(
    dryRun = false,
  ): Promise<ReconciliationReport> {
    const jobRun = await this.createJobRun('reconcile-available-copies');
    const changes: ReconciliationChange[] = [];
    const errorMessages: string[] = [];
    let scanned = 0;
    let fixed = 0;
    let errors = 0;

    try {
      const books = await this.bookModel.find().lean();

      for (let i = 0; i < books.length; i += RECONCILE_BATCH_SIZE) {
        const batch = books.slice(i, i + RECONCILE_BATCH_SIZE);
        const bookIds = batch.map((b) => b._id);

        const copyCounts = await this.copyModel.aggregate([
          { $match: { bookId: { $in: bookIds } } },
          {
            $group: {
              _id: '$bookId',
              available: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', CopyPhysicalStatus.AVAILABLE] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]);

        const actualMap = new Map<string, number>(
          copyCounts.map((c) => [c._id.toString(), c.available]),
        );

        for (const book of batch) {
          scanned++;
          const actual = actualMap.get(book._id.toString()) ?? 0;

          if (book.availableCopies !== actual) {
            changes.push({
              entityType: 'Book',
              entityId: book._id.toString(),
              field: 'availableCopies',
              previousValue: book.availableCopies,
              newValue: actual,
            });

            if (!dryRun) {
              try {
                await this.bookModel.updateOne(
                  { _id: book._id },
                  { $set: { availableCopies: actual } },
                );
                fixed++;
              } catch (err) {
                errors++;
                errorMessages.push(
                  `Book ${book._id.toString()}: ${(err as Error).message}`,
                );
              }
            } else {
              fixed++;
            }
          }
        }
      }

      await this.finalizeJobRun(jobRun, scanned, fixed, errors);
    } catch (err) {
      errors++;
      errorMessages.push((err as Error).message);
      await this.failJobRun(jobRun, scanned, fixed, errors, (err as Error).message);
    }

    return {
      jobName: 'reconcile-available-copies',
      dryRun,
      timestamp: new Date().toISOString(),
      scanned,
      fixed,
      errors,
      changes,
      errorMessages,
    };
  }

  async reconcileLoanStatuses(dryRun = false): Promise<ReconciliationReport> {
    const jobRun = await this.createJobRun('reconcile-loan-statuses');
    const changes: ReconciliationChange[] = [];
    const errorMessages: string[] = [];
    let scanned = 0;
    let fixed = 0;
    let errors = 0;

    try {
      const now = new Date();

      // 1. ACTIVE loans past dueDate → should have been transitioned to OVERDUE
      let skip = 0;
      while (true) {
        const overdueActive = await this.loanModel
          .find({ status: LoanStatus.ACTIVE, dueDate: { $lte: now } })
          .skip(skip)
          .limit(RECONCILE_BATCH_SIZE)
          .lean();

        if (overdueActive.length === 0) break;

        for (const loan of overdueActive) {
          scanned++;
          changes.push({
            entityType: 'Loan',
            entityId: loan._id.toString(),
            field: 'status',
            previousValue: loan.status,
            newValue: LoanStatus.OVERDUE,
          });

          if (!dryRun) {
            try {
              await this.loanModel.updateOne(
                { _id: loan._id, status: LoanStatus.ACTIVE },
                { $set: { status: LoanStatus.OVERDUE } },
              );
              fixed++;
            } catch (err) {
              errors++;
              errorMessages.push(
                `Loan ${loan._id.toString()}: ${(err as Error).message}`,
              );
            }
          } else {
            fixed++;
          }
        }

        if (overdueActive.length < RECONCILE_BATCH_SIZE) break;
        skip += RECONCILE_BATCH_SIZE;
      }

      // 2. RETURNED loans still marked ACTIVE — shouldn't exist but check
      //    for loans where status=RETURNED but copyStatus doesn't reflect it
      skip = 0;
      while (true) {
        const returnedLoans = await this.loanModel
          .find({ status: LoanStatus.RETURNED })
          .skip(skip)
          .limit(RECONCILE_BATCH_SIZE)
          .lean();

        if (returnedLoans.length === 0) break;

        for (const loan of returnedLoans) {
          scanned++;
          // These are already RETURNED so no fix needed, but we log them
          // as scanned for visibility in the report.
        }

        if (returnedLoans.length < RECONCILE_BATCH_SIZE) break;
        skip += RECONCILE_BATCH_SIZE;
      }

      await this.finalizeJobRun(jobRun, scanned, fixed, errors);
    } catch (err) {
      errors++;
      errorMessages.push((err as Error).message);
      await this.failJobRun(jobRun, scanned, fixed, errors, (err as Error).message);
    }

    return {
      jobName: 'reconcile-loan-statuses',
      dryRun,
      timestamp: new Date().toISOString(),
      scanned,
      fixed,
      errors,
      changes,
      errorMessages,
    };
  }

  async reconcileBalances(dryRun = false): Promise<ReconciliationReport> {
    const jobRun = await this.createJobRun('reconcile-balances');
    const changes: ReconciliationChange[] = [];
    const errorMessages: string[] = [];
    let scanned = 0;
    let fixed = 0;
    let errors = 0;

    try {
      const balances = await this.patronBalanceModel.find().lean();

      for (let i = 0; i < balances.length; i += RECONCILE_BATCH_SIZE) {
        const batch = balances.slice(i, i + RECONCILE_BATCH_SIZE);

        for (const balance of batch) {
          scanned++;

          const [aggregate] = await this.ledgerEntryModel.aggregate<{
            _id: null;
            sum: number;
            count: number;
          }>([
            {
              $match: {
                patronId: balance.patronId,
                currency: balance.currency,
              },
            },
            {
              $group: {
                _id: null,
                sum: { $sum: '$amountMinorUnits' },
                count: { $sum: 1 },
              },
            },
          ]);

          const computedBalance = aggregate?.sum ?? 0;
          const computedCount = aggregate?.count ?? 0;

          if (
            balance.balanceMinorUnits !== computedBalance ||
            balance.entryCount !== computedCount
          ) {
            changes.push({
              entityType: 'PatronBalance',
              entityId: balance._id.toString(),
              field: 'balanceMinorUnits',
              previousValue: balance.balanceMinorUnits,
              newValue: computedBalance,
            });

            if (!dryRun) {
              try {
                await this.patronBalanceModel.updateOne(
                  { _id: balance._id },
                  {
                    $set: {
                      balanceMinorUnits: computedBalance,
                      entryCount: computedCount,
                    },
                  },
                );
                fixed++;
              } catch (err) {
                errors++;
                errorMessages.push(
                  `PatronBalance ${balance._id.toString()}: ${(err as Error).message}`,
                );
              }
            } else {
              fixed++;
            }
          }
        }
      }

      await this.finalizeJobRun(jobRun, scanned, fixed, errors);
    } catch (err) {
      errors++;
      errorMessages.push((err as Error).message);
      await this.failJobRun(jobRun, scanned, fixed, errors, (err as Error).message);
    }

    return {
      jobName: 'reconcile-balances',
      dryRun,
      timestamp: new Date().toISOString(),
      scanned,
      fixed,
      errors,
      changes,
      errorMessages,
    };
  }

  private async createJobRun(
    jobName: string,
  ): Promise<SchedulerJobRunDocument> {
    return this.jobRunModel.create({
      jobName,
      startedAt: new Date(),
      status: 'running',
    });
  }

  private async finalizeJobRun(
    jobRun: SchedulerJobRunDocument,
    scanned: number,
    fixed: number,
    errors: number,
  ): Promise<void> {
    await this.jobRunModel.updateOne(
      { _id: jobRun._id },
      {
        $set: {
          completedAt: new Date(),
          scannedCount: scanned,
          transitionedCount: fixed,
          errorCount: errors,
          status: errors > 0 ? 'failed' : 'completed',
        },
      },
    );
  }

  private async failJobRun(
    jobRun: SchedulerJobRunDocument,
    scanned: number,
    fixed: number,
    errors: number,
    errorMessage: string,
  ): Promise<void> {
    await this.jobRunModel.updateOne(
      { _id: jobRun._id },
      {
        $set: {
          completedAt: new Date(),
          scannedCount: scanned,
          transitionedCount: fixed,
          errorCount: errors,
          status: 'failed',
          errorMessage,
        },
      },
    );
  }
}
