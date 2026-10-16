import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import { Hold, HoldDocument, HoldStatus } from '../schemas/hold.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument } from '../schemas/book-copy.schema';

export interface CirculationMetricsQuery {
  from?: string;
  to?: string;
  branch?: string;
  format?: string;
}

export interface CirculationSummary {
  period: { from: string; to: string };
  checkouts: number;
  returns: number;
  renewals: number;
  overdueCount: number;
  overdueRate: number;
  holdFulfillmentRate: number;
  utilizationRate: number;
  averageTurnaroundDays: number;
  byBranch: Record<string, { checkouts: number; returns: number }>;
  byFormat: Record<string, { checkouts: number; returns: number }>;
}

@Injectable()
export class CirculationMetricsService {
  constructor(
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name)
    private readonly holdModel: Model<HoldDocument>,
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
  ) {}

  async getCirculationMetrics(
    query: CirculationMetricsQuery,
  ): Promise<CirculationSummary> {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;

    const loanFilter: Record<string, unknown> = {
      checkedOutAt: { $gte: from, $lte: to },
    };

    const returnFilter: Record<string, unknown> = {
      status: LoanStatus.RETURNED,
      updatedAt: { $gte: from, $lte: to },
    };

    const allLoansInPeriod = await this.loanModel.find(loanFilter).lean().exec();
    const returnedLoans = await this.loanModel.find(returnFilter).lean().exec();

    const checkouts = allLoansInPeriod.length;
    const returns = returnedLoans.length;

    let renewals = 0;
    for (const loan of allLoansInPeriod) {
      if (loan.renewalHistory?.length) {
        const periodRenewals = loan.renewalHistory.filter(
          (r) => r.renewedAt >= from && r.renewedAt <= to,
        );
        renewals += periodRenewals.length;
      }
    }

    const overdueLoans = allLoansInPeriod.filter(
      (loan) => loan.dueDate < loan.checkedOutAt || loan.status === LoanStatus.OVERDUE,
    );
    const overdueCount = overdueLoans.length;
    const overdueRate = checkouts > 0 ? overdueCount / checkouts : 0;

    const holdsInPeriod = await this.holdModel
      .find({ requestedAt: { $gte: from, $lte: to } })
      .lean()
      .exec();

    const fulfilledHolds = holdsInPeriod.filter(
      (h) => h.status === HoldStatus.FULFILLED,
    );
    const holdFulfillmentRate =
      holdsInPeriod.length > 0
        ? fulfilledHolds.length / holdsInPeriod.length
        : 0;

    const totalCopies = await this.copyModel.countDocuments().exec();
    const checkedOutCopies = await this.copyModel
      .countDocuments({ status: 'checked_out' })
      .exec();
    const utilizationRate = totalCopies > 0 ? checkedOutCopies / totalCopies : 0;

    let totalTurnaroundDays = 0;
    let turnaroundCount = 0;
    for (const loan of returnedLoans) {
      if (loan.createdAt && loan.updatedAt) {
        totalTurnaroundDays +=
          (loan.updatedAt.getTime() - loan.checkedOutAt.getTime()) /
          (1000 * 60 * 60 * 24);
        turnaroundCount++;
      }
    }
    const averageTurnaroundDays =
      turnaroundCount > 0 ? totalTurnaroundDays / turnaroundCount : 0;

    const byBranch: Record<string, { checkouts: number; returns: number }> = {};
    const byFormat: Record<string, { checkouts: number; returns: number }> = {};

    for (const loan of allLoansInPeriod) {
      const book = await this.bookModel.findById(loan.bookId).lean().exec();
      const format = book?.format ?? 'unknown';
      if (!byFormat[format]) byFormat[format] = { checkouts: 0, returns: 0 };
      byFormat[format].checkouts++;
    }

    for (const loan of returnedLoans) {
      const book = await this.bookModel.findById(loan.bookId).lean().exec();
      const format = book?.format ?? 'unknown';
      if (!byFormat[format]) byFormat[format] = { checkouts: 0, returns: 0 };
      byFormat[format].returns++;
    }

    if (query.branch) {
      const copies = await this.copyModel
        .find({ branch: query.branch })
        .select('_id')
        .lean()
        .exec();
      const copyIds = new Set(copies.map((c) => c._id.toString()));

      const branchCheckouts = allLoansInPeriod.filter((l) =>
        copyIds.has(l.bookId.toString()),
      );
      const branchReturns = returnedLoans.filter((l) =>
        copyIds.has(l.bookId.toString()),
      );

      byBranch[query.branch] = {
        checkouts: branchCheckouts.length,
        returns: branchReturns.length,
      };
    }

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      checkouts,
      returns,
      renewals,
      overdueCount,
      overdueRate: Math.round(overdueRate * 10000) / 10000,
      holdFulfillmentRate: Math.round(holdFulfillmentRate * 10000) / 10000,
      utilizationRate: Math.round(utilizationRate * 10000) / 10000,
      averageTurnaroundDays: Math.round(averageTurnaroundDays * 100) / 100,
      byBranch,
      byFormat,
    };
  }
}
