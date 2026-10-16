import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FinanceStatement,
  FinanceStatementDocument,
  StatementExportStatus,
} from '../schemas/finance-statement.schema';
import { ScholarshipFinanceStatementService } from '../scholarship-finance-statement.service';

/**
 * ScholarshipFinanceStatementJobs
 *
 * Scheduled jobs that support asynchronous statement generation and retention:
 *
 *   1. processAsyncStatements  — picks up PENDING statements and runs
 *        `computeStatement()` for each one.  Runs every 2 minutes.
 *
 *   2. expireStaleStatements   — marks READY statements whose `expiresAt`
 *        has passed as EXPIRED and clears their `lineItems` to free storage.
 *        Runs daily at 02:00 UTC.
 *
 * Operational impact:
 *   - processAsyncStatements processes up to MAX_BATCH statements per run to
 *     avoid long-running job executions blocking the event loop.
 *   - expireStaleStatements is a bulk MongoDB update; it does not load
 *     documents into memory.
 */
@Injectable()
export class ScholarshipFinanceStatementJobs {
  private readonly logger = new Logger(ScholarshipFinanceStatementJobs.name);
  private static readonly MAX_BATCH = 10;

  constructor(
    @InjectModel(FinanceStatement.name)
    private readonly statementModel: Model<FinanceStatementDocument>,
    private readonly statementService: ScholarshipFinanceStatementService,
  ) {}

  @Cron('0 */2 * * * *') // every 2 minutes
  async processAsyncStatements(): Promise<void> {
    const pending = await this.statementModel
      .find({ status: StatementExportStatus.PENDING })
      .limit(ScholarshipFinanceStatementJobs.MAX_BATCH)
      .exec();

    if (pending.length === 0) return;

    this.logger.log(`Processing ${pending.length} pending statement(s)`);

    for (const doc of pending) {
      try {
        await this.statementService.computeStatement(doc);
        this.logger.log(`Statement ${String(doc._id)} computed successfully`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Statement ${String(doc._id)} failed: ${msg}`);
        // The service already persisted FAILED status; continue with the rest.
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async expireStaleStatements(): Promise<void> {
    const count = await this.statementService.expireStaleStatements();
    if (count > 0) {
      this.logger.log(`Expired ${count} stale finance statement(s)`);
    }
  }
}
