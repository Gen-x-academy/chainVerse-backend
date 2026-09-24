import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationService } from '../services/recommendation.service';
import { PopularityRankingService } from '../services/popularity-ranking.service';
import { Book } from '../schemas/book.schema';
import { Loan } from '../schemas/loan.schema';
import { SavedList } from '../schemas/saved-list.schema';
import { BookReview, ReviewStatus } from '../schemas/book-review.schema';
import { BorrowerPreference } from '../schemas/borrower-preference.schema';

const B1 = '507f1f77bcf86cd799439011';
const B2 = '507f1f77bcf86cd799439012';
const B3 = '507f1f77bcf86cd799439013';

function findLeanExec(result: unknown[]) {
  const exec = jest.fn().mockResolvedValue(result);
  const lean = jest.fn().mockReturnValue({ exec });
  const find = jest.fn().mockReturnValue({ lean });
  return find;
}

function findOneLeanExec(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const lean = jest.fn().mockReturnValue({ exec });
  const findOne = jest.fn().mockReturnValue({ lean });
  return findOne;
}

function findSelectLean(result: unknown[]) {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  const find = jest.fn().mockReturnValue({ select });
  return find;
}

describe('RecommendationService', () => {
  let service: RecommendationService;
  let bookModel: jest.Mocked<Model<Book>>;
  let loanModel: jest.Mocked<Model<Loan>>;
  let savedListModel: jest.Mocked<Model<SavedList>>;
  let reviewModel: jest.Mocked<Model<BookReview>>;
  let prefModel: jest.Mocked<Model<BorrowerPreference>>;
  let popularityService: jest.Mocked<PopularityRankingService>;

  const bookRows = [
    { _id: B1, title: 'Book A', author: 'A', format: 'ebook', workKey: 'w1', availableCopies: 2 },
    { _id: B2, title: 'Book B', author: 'B', format: 'physical', workKey: 'w2', availableCopies: 0 },
    { _id: B3, title: 'Book C', author: 'C', format: 'ebook', workKey: 'w3', availableCopies: 5 },
  ];

  beforeEach(async () => {
    bookModel = { find: jest.fn() } as any;
    loanModel = { find: jest.fn() } as any;
    savedListModel = { find: jest.fn() } as any;
    reviewModel = { find: jest.fn() } as any;
    prefModel = { findOne: jest.fn() } as any;
    popularityService = { getPopularBooks: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(SavedList.name), useValue: savedListModel },
        { provide: getModelToken(BookReview.name), useValue: reviewModel },
        { provide: getModelToken(BorrowerPreference.name), useValue: prefModel },
        { provide: PopularityRankingService, useValue: popularityService },
      ],
    }).compile();

    service = module.get<RecommendationService>(RecommendationService);
  });

  it('should return an empty list when the user has opted out', async () => {
    (prefModel.findOne as jest.Mock).mockImplementation(
      findOneLeanExec({ patronId: 'p1', optOutRecommendations: true }),
    );

    const result = await service.getRecommendations('p1');

    expect(result.items).toEqual([]);
  });

  it('should fall back to popular books for users with no history', async () => {
    (prefModel.findOne as jest.Mock).mockImplementation(
      findOneLeanExec(null),
    );
    (loanModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (savedListModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (reviewModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (popularityService.getPopularBooks as jest.Mock).mockResolvedValue({
      items: [
        { id: B1, title: 'Book A', author: 'A', format: 'ebook', workKey: 'w1' },
      ],
    });

    const result = await service.getRecommendations('new-user', 10);

    expect(result.reason).toBe('cold_start_fallback');
    expect(result.items[0].reason).toBe('cold_start_fallback');
  });

  it('should recommend books based on borrowing history and ratings', async () => {
    (prefModel.findOne as jest.Mock).mockImplementation(
      findOneLeanExec(null),
    );
    (loanModel.find as jest.Mock).mockImplementation(
      findLeanExec([{ bookId: B1 }]),
    );
    (savedListModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (reviewModel.find as jest.Mock).mockImplementation(
      findLeanExec([{ bookId: B3, rating: 5, status: ReviewStatus.PUBLISHED }]),
    );
    (bookModel.find as jest.Mock).mockImplementation(
      findSelectLean([bookRows[0], bookRows[2]]),
    );

    const result = await service.getRecommendations('p1', 10);

    const reasons = result.items.map((i: { reason: string }) => i.reason);
    expect(reasons).toContain('based_on_borrowing_history');
    expect(reasons).toContain('based_on_ratings');
  });

  it('should exclude unavailable books when excludeUnavailable is set', async () => {
    (prefModel.findOne as jest.Mock).mockImplementation(
      findOneLeanExec(null),
    );
    (loanModel.find as jest.Mock).mockImplementation(
      findLeanExec([{ bookId: B1 }, { bookId: B2 }]),
    );
    (savedListModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (reviewModel.find as jest.Mock).mockImplementation(findLeanExec([]));
    (bookModel.find as jest.Mock).mockImplementation(
      findSelectLean([bookRows[0]]),
    );

    await service.getRecommendations('p1', 10, true);

    expect(bookModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ availableCopies: { $gt: 0 } }),
    );
  });
});
