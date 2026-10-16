import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookFormat } from '../schemas/book.schema';
import { Loan } from '../schemas/loan.schema';
import { Hold } from '../schemas/hold.schema';
import { PopularityWindow } from '../dto/popular-books-query.dto';

const WINDOW_DAYS: Record<PopularityWindow, number> = {
  [PopularityWindow.WEEK]: 7,
  [PopularityWindow.MONTH]: 30,
  [PopularityWindow.QUARTER]: 90,
  [PopularityWindow.YEAR]: 365,
};

const MIN_CHECKOUTS_THRESHOLD = 3;
const CHECKOUT_WEIGHT = 3;
const HOLD_WEIGHT = 2;
const RENEWAL_WEIGHT = 1;

// Bot / admin activity is excluded so internal circulation never skews the
// public ranking. Configurable via environment for the deployment's conventions.
const EXCLUDED_PATRON_PREFIXES = (
  process.env.E_LIBRARY_EXCLUDED_RANKING_PATRONS ?? 'bot-,admin-,system-'
)
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

@Injectable()
export class PopularityRankingService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @InjectModel(Loan.name) private readonly loanModel: Model<Loan>,
    @InjectModel(Hold.name) private readonly holdModel: Model<Hold>,
  ) {}

  async getPopularBooks(
    window: PopularityWindow = PopularityWindow.MONTH,
    limit = 20,
    format?: BookFormat,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const since = new Date(Date.now() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);
    const exclusion = { $nin: EXCLUDED_PATRON_PREFIXES.map((p) => new RegExp(`^${p}`)) };

    const loanAgg = await this.loanModel
      .aggregate<{
        _id: Types.ObjectId;
        checkouts: number;
        renewals: number;
      }>([
        {
          $match: {
            createdAt: { $gte: since },
            patronId: exclusion,
          },
        },
        {
          $group: {
            _id: '$bookId',
            checkouts: { $sum: 1 },
            renewals: { $sum: '$renewalCount' },
          },
        },
      ]);

    const holdAgg = await this.holdModel.aggregate<{
      _id: Types.ObjectId;
      holds: number;
    }>([
      {
        $match: {
          createdAt: { $gte: since },
          patronId: exclusion,
        },
      },
      { $group: { _id: '$bookId', holds: { $sum: 1 } } },
    ]);

    const scoreByBook = new Map<string, { score: number; checkouts: number }>();
    for (const row of loanAgg) {
      const id = String(row._id);
      scoreByBook.set(id, {
        score:
          row.checkouts * CHECKOUT_WEIGHT +
          row.renewals * RENEWAL_WEIGHT,
        checkouts: row.checkouts,
      });
    }
    for (const row of holdAgg) {
      const id = String(row._id);
      const existing = scoreByBook.get(id) ?? { score: 0, checkouts: 0 };
      existing.score += row.holds * HOLD_WEIGHT;
      scoreByBook.set(id, existing);
    }

    const qualifying = [...scoreByBook.entries()].filter(
      ([, v]) => v.checkouts >= MIN_CHECKOUTS_THRESHOLD,
    );
    if (qualifying.length === 0) {
      return { items: [], window, limit: safeLimit };
    }

    const bookIds = qualifying.map(([id]) => id);
    const bookFilter: Record<string, unknown> = { _id: { $in: bookIds } };
    if (format) {
      bookFilter.format = format;
    }
    const books = await this.bookModel
      .find(bookFilter)
      .select('-__v')
      .lean();

    const byId = new Map(books.map((b) => [String(b._id), b]));
    const ranked = qualifying
      .map(([id, score]) => ({
        ...score,
        book: byId.get(id),
      }))
      .filter((entry) => entry.book)
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.book?.title ?? '').localeCompare(String(b.book?.title ?? '')),
      );

    const items = ranked.slice(0, safeLimit).map((entry) => ({
      id: (entry.book! as { _id: unknown })._id,
      title: entry.book!.title,
      author: entry.book!.author,
      format: entry.book!.format,
      workKey: entry.book!.workKey,
      score: entry.score,
      checkouts: entry.checkouts,
      availableCopies: entry.book!.availableCopies,
    }));

    return {
      items,
      window,
      limit: safeLimit,
      computedAt: new Date(),
    };
  }
}
