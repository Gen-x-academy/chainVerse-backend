import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyStatus } from '../schemas/book-copy.schema';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';

export interface CollectionReportQuery {
  from?: string;
  to?: string;
  branch?: string;
  reportType?: string;
  limit?: number;
}

export interface DemandItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  availableCopies: number;
  loanCount: number;
  holdCount: number;
  demandScore: number;
}

export interface LowAvailabilityItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  availableCopies: number;
  utilizationRate: number;
  pendingHolds: number;
}

export interface UnusedItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  lastLoanDate: Date | null;
  daysSinceLastLoan: number | null;
  acquisitionDate: Date | null;
}

export interface AgingItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  oldestCopyAge: number;
  conditionBreakdown: Record<string, number>;
}

export interface LostDamagedItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  lostCopies: number;
  damagedCopies: number;
  flaggedCopies: number;
  lostRate: number;
}

@Injectable()
export class CollectionReportService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
  ) {}

  async getCollectionReport(query: CollectionReportQuery) {
    const reportType = query.reportType ?? 'demand';
    const limit = query.limit ?? 20;
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;

    switch (reportType) {
      case 'demand':
        return this.getHighDemandBooks(from, to, limit);
      case 'low_availability':
        return this.getLowAvailabilityBooks(limit);
      case 'unused':
        return this.getUnusedBooks(from, limit);
      case 'aging':
        return this.getAgingBooks(limit);
      case 'lost_damaged':
        return this.getLostAndDamagedBooks(limit);
      default:
        return this.getHighDemandBooks(from, to, limit);
    }
  }

  async getHighDemandBooks(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<DemandItem[]> {
    const books = await this.bookModel.find().lean().exec();
    const results: DemandItem[] = [];

    for (const book of books) {
      const bookId = book._id.toString();

      const loanFilter: Record<string, unknown> = {
        bookId: book._id,
        checkedOutAt: { $gte: from, $lte: to },
      };

      const loanCount = await this.loanModel.countDocuments(loanFilter).exec();

      const holdFilter: Record<string, unknown> = {
        bookId: book._id,
        requestedAt: { $gte: from, $lte: to },
        status: { $in: ['pending', 'ready'] },
      };

      const holdCount = await this.loanModel.countDocuments(holdFilter).exec();
      const demandScore = loanCount * 2 + holdCount * 3;

      results.push({
        bookId,
        title: book.title,
        author: book.author,
        format: book.format,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        loanCount,
        holdCount,
        demandScore,
      });
    }

    results.sort((a, b) => b.demandScore - a.demandScore);
    return results.slice(0, limit);
  }

  async getLowAvailabilityBooks(limit: number): Promise<LowAvailabilityItem[]> {
    const books = await this.bookModel.find().lean().exec();
    const results: LowAvailabilityItem[] = [];

    for (const book of books) {
      if (book.totalCopies === 0) continue;

      const utilizationRate =
        book.totalCopies > 0
          ? (book.totalCopies - book.availableCopies) / book.totalCopies
          : 0;

      const pendingHolds = await this.loanModel
        .countDocuments({
          bookId: book._id,
          status: { $in: ['active', 'overdue'] },
        })
        .exec();

      if (utilizationRate >= 0.8 || book.availableCopies <= 1) {
        results.push({
          bookId: book._id.toString(),
          title: book.title,
          author: book.author,
          format: book.format,
          totalCopies: book.totalCopies,
          availableCopies: book.availableCopies,
          utilizationRate: Math.round(utilizationRate * 10000) / 10000,
          pendingHolds,
        });
      }
    }

    results.sort((a, b) => b.utilizationRate - a.utilizationRate);
    return results.slice(0, limit);
  }

  async getUnusedBooks(from: Date, limit: number): Promise<UnusedItem[]> {
    const books = await this.bookModel.find().lean().exec();
    const results: UnusedItem[] = [];

    for (const book of books) {
      const lastLoan = await this.loanModel
        .findOne({ bookId: book._id })
        .sort({ checkedOutAt: -1 })
        .lean()
        .exec();

      const lastLoanDate = lastLoan?.checkedOutAt ?? null;
      const daysSinceLastLoan = lastLoanDate
        ? Math.floor(
            (new Date().getTime() - lastLoanDate.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      if (!lastLoan || (daysSinceLastLoan !== null && daysSinceLastLoan > 90)) {
        results.push({
          bookId: book._id.toString(),
          title: book.title,
          author: book.author,
          format: book.format,
          totalCopies: book.totalCopies,
          lastLoanDate,
          daysSinceLastLoan,
          acquisitionDate: null,
        });
      }
    }

    results.sort((a, b) => (b.daysSinceLastLoan ?? 9999) - (a.daysSinceLastLoan ?? 9999));
    return results.slice(0, limit);
  }

  async getAgingBooks(limit: number): Promise<AgingItem[]> {
    const copies = await this.copyModel
      .find()
      .sort({ acquisitionDate: 1 })
      .lean()
      .exec();

    const bookCopyMap = new Map<
      string,
      {
        bookId: string;
        copies: typeof copies;
      }
    >();

    for (const copy of copies) {
      const bookId = copy.bookId.toString();
      if (!bookCopyMap.has(bookId)) {
        bookCopyMap.set(bookId, { bookId, copies: [] });
      }
      bookCopyMap.get(bookId)!.copies.push(copy);
    }

    const results: AgingItem[] = [];
    const now = new Date();

    for (const [, entry] of bookCopyMap) {
      const oldestCopy = entry.copies[0];
      const acquisitionDate = oldestCopy?.acquisitionDate;
      const oldestCopyAge = acquisitionDate
        ? Math.floor(
            (now.getTime() - acquisitionDate.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 9999;

      const conditionBreakdown: Record<string, number> = {};
      for (const copy of entry.copies) {
        const cond = copy.condition ?? 'unknown';
        conditionBreakdown[cond] = (conditionBreakdown[cond] ?? 0) + 1;
      }

      const book = await this.bookModel.findById(entry.bookId).lean().exec();
      if (book) {
        results.push({
          bookId: entry.bookId,
          title: book.title,
          author: book.author,
          format: book.format,
          totalCopies: book.totalCopies,
          oldestCopyAge,
          conditionBreakdown,
        });
      }
    }

    results.sort((a, b) => b.oldestCopyAge - a.oldestCopyAge);
    return results.slice(0, limit);
  }

  async getLostAndDamagedBooks(limit: number): Promise<LostDamagedItem[]> {
    const copies = await this.copyModel.find().lean().exec();

    const bookCopyMap = new Map<string, typeof copies>();

    for (const copy of copies) {
      const bookId = copy.bookId.toString();
      if (!bookCopyMap.has(bookId)) {
        bookCopyMap.set(bookId, []);
      }
      bookCopyMap.get(bookId)!.push(copy);
    }

    const results: LostDamagedItem[] = [];

    for (const [bookId, bookCopies] of bookCopyMap) {
      const lostCopies = bookCopies.filter(
        (c) => c.status === CopyStatus.WITHDRAWN || c.condition === 'damaged',
      ).length;
      const damagedCopies = bookCopies.filter(
        (c) => c.condition === 'poor' || c.condition === 'damaged',
      ).length;
      const flaggedCopies = bookCopies.filter(
        (c) => c.status === CopyStatus.IN_REPAIR,
      ).length;

      if (lostCopies > 0 || damagedCopies > 0 || flaggedCopies > 0) {
        const book = await this.bookModel.findById(bookId).lean().exec();
        if (book) {
          results.push({
            bookId,
            title: book.title,
            author: book.author,
            format: book.format,
            totalCopies: book.totalCopies,
            lostCopies,
            damagedCopies,
            flaggedCopies,
            lostRate:
              book.totalCopies > 0
                ? Math.round((lostCopies / book.totalCopies) * 10000) / 10000
                : 0,
          });
        }
      }
    }

    results.sort((a, b) => b.lostRate - a.lostRate);
    return results.slice(0, limit);
  }
}
