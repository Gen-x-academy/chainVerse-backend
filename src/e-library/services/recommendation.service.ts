import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookFormat } from '../schemas/book.schema';
import { Loan } from '../schemas/loan.schema';
import { SavedList } from '../schemas/saved-list.schema';
import { BookReview, ReviewStatus } from '../schemas/book-review.schema';
import { BorrowerPreference } from '../schemas/borrower-preference.schema';
import { PopularityRankingService } from './popularity-ranking.service';

export type RecommendationReason =
  | 'based_on_borrowing_history'
  | 'based_on_ratings'
  | 'based_on_interests'
  | 'popular'
  | 'cold_start_fallback';

const MIN_PREFERRED_RATING = 4;

interface Candidate {
  bookId: string;
  reason: RecommendationReason;
  priority: number;
}

@Injectable()
export class RecommendationService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @InjectModel(Loan.name) private readonly loanModel: Model<Loan>,
    @InjectModel(SavedList.name) private readonly savedListModel: Model<SavedList>,
    @InjectModel(BookReview.name) private readonly reviewModel: Model<BookReview>,
    @InjectModel(BorrowerPreference.name)
    private readonly prefModel: Model<BorrowerPreference>,
    private readonly popularityService: PopularityRankingService,
  ) {}

  async getRecommendations(
    patronId: string,
    limit = 10,
    excludeUnavailable = true,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    const pref = await this.prefModel.findOne({ patronId }).lean().exec();
    if (pref?.optOutRecommendations) {
      return { items: [], recommendationsFor: patronId, reason: 'opted_out' };
    }

    const candidates = await this.collectCandidates(patronId);

    if (candidates.size === 0) {
      const popular = await this.popularityService.getPopularBooks(
        undefined,
        safeLimit,
        undefined,
      );
      const items = popular.items.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        format: book.format,
        workKey: book.workKey,
        reason: 'cold_start_fallback' as RecommendationReason,
      }));
      return { items, recommendationsFor: patronId, reason: 'cold_start_fallback' };
    }

    const candidateBookIds = [...candidates.keys()];
    const filter: Record<string, unknown> = { _id: { $in: candidateBookIds } };
    if (excludeUnavailable) {
      filter.availableCopies = { $gt: 0 };
    }
    const books = await this.bookModel.find(filter).select('-__v').lean();

    const items = books
      .map((book) => {
        const c = candidates.get(String(book._id));
        return {
          id: book._id,
          title: book.title,
          author: book.author,
          format: book.format,
          workKey: book.workKey,
          availableCopies: book.availableCopies,
          reason: c?.reason ?? ('popular' as RecommendationReason),
        };
      })
      .sort(
        (a, b) =>
          (candidates.get(String(b.id))?.priority ?? 0) -
            (candidates.get(String(a.id))?.priority ?? 0) ||
          String(a.title).localeCompare(String(b.title)),
      )
      .slice(0, safeLimit);

    return { items, recommendationsFor: patronId, reason: 'based_on_history' };
  }

  private async collectCandidates(patronId: string): Promise<Map<string, Candidate>> {
    const candidates = new Map<string, Candidate>();
    const add = (bookId: string, reason: RecommendationReason, priority: number) => {
      const existing = candidates.get(bookId);
      if (!existing || priority < existing.priority) {
        candidates.set(bookId, { bookId, reason, priority });
      }
    };

    const [loans, lists, reviews] = await Promise.all([
      this.loanModel.find({ patronId }).lean().exec(),
      this.savedListModel.find({ patronId }).lean().exec(),
      this.reviewModel
        .find({ patronId, status: ReviewStatus.PUBLISHED })
        .lean()
        .exec(),
    ]);

    for (const loan of loans) {
      add(String(loan.bookId), 'based_on_borrowing_history', 1);
    }

    for (const list of lists) {
      for (const item of list.items ?? []) {
        add(String(item.bookId), 'based_on_interests', 1);
      }
    }

    for (const review of reviews) {
      if (review.rating >= MIN_PREFERRED_RATING) {
        add(String(review.bookId), 'based_on_ratings', 2);
      }
    }

    return candidates;
  }
}
