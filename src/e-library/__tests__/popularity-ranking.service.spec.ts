import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PopularityRankingService } from '../services/popularity-ranking.service';
import { Book, BookFormat } from '../schemas/book.schema';
import { Loan } from '../schemas/loan.schema';
import { Hold } from '../schemas/hold.schema';
import { PopularityWindow } from '../dto/popular-books-query.dto';

const B1 = '507f1f77bcf86cd799439011';
const B2 = '507f1f77bcf86cd799439012';

function leanFindChain(result: unknown[]) {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  const find = jest.fn().mockReturnValue({ select });
  return find;
}

describe('PopularityRankingService', () => {
  let service: PopularityRankingService;
  let bookModel: jest.Mocked<Model<Book>>;
  let loanModel: jest.Mocked<Model<Loan>>;
  let holdModel: jest.Mocked<Model<Hold>>;

  const bookRows = [
    {
      _id: B1,
      title: 'Alpha Book',
      author: 'A',
      workKey: 'wk-1',
      format: BookFormat.EBOOK,
      availableCopies: 3,
    },
    {
      _id: B2,
      title: 'Beta Book',
      author: 'B',
      workKey: 'wk-2',
      format: BookFormat.PHYSICAL,
      availableCopies: 2,
    },
  ];

  beforeEach(async () => {
    bookModel = {
      find: jest.fn(),
    } as any;
    loanModel = { aggregate: jest.fn() } as any;
    holdModel = { aggregate: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PopularityRankingService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
      ],
    }).compile();

    service = module.get<PopularityRankingService>(PopularityRankingService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should aggregate checkouts, renewals and holds into a weighted score', async () => {
    (loanModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: B1, checkouts: 3, renewals: 2 },
      { _id: B2, checkouts: 5, renewals: 1 },
    ]);
    (holdModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: B1, holds: 1 },
    ]);
    (bookModel.find as jest.Mock).mockImplementation(leanFindChain(bookRows));

    const result = await service.getPopularBooks(PopularityWindow.MONTH, 20);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe(B2);
    expect(result.items[1].id).toBe(B1);
    expect(result.items[0].score).toBe(5 * 3 + 1 * 1);
    expect(result.items[1].score).toBe(3 * 3 + 2 * 1 + 1 * 2);
  });

  it('should not rank books with fewer than 3 checkouts', async () => {
    (loanModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: B1, checkouts: 2, renewals: 0 },
      { _id: B2, checkouts: 4, renewals: 0 },
    ]);
    (holdModel.aggregate as jest.Mock).mockResolvedValue([]);
    (bookModel.find as jest.Mock).mockImplementation(
      leanFindChain([bookRows[1]]),
    );

    const result = await service.getPopularBooks(PopularityWindow.WEEK, 20);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(B2);
  });

  it('should break ties deterministically by title', async () => {
    (loanModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: B1, checkouts: 3, renewals: 0 },
      { _id: B2, checkouts: 3, renewals: 0 },
    ]);
    (holdModel.aggregate as jest.Mock).mockResolvedValue([]);
    (bookModel.find as jest.Mock).mockImplementation(leanFindChain(bookRows));

    const result = await service.getPopularBooks(PopularityWindow.YEAR, 20);

    expect(result.items[0].id).toBe(B1); // Alpha before Beta
  });

  it('should apply the format filter when provided', async () => {
    (loanModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: B1, checkouts: 5, renewals: 0 },
    ]);
    (holdModel.aggregate as jest.Mock).mockResolvedValue([]);
    (bookModel.find as jest.Mock).mockImplementation(
      leanFindChain([bookRows[0]]),
    );

    await service.getPopularBooks(
      PopularityWindow.MONTH,
      20,
      BookFormat.EBOOK,
    );

    expect(bookModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ format: BookFormat.EBOOK }),
    );
  });
});
