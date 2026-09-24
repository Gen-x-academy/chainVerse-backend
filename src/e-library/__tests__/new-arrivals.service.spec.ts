import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NewArrivalsService } from '../services/new-arrivals.service';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { NewArrivalsQueryDto } from '../dto/new-arrivals-query.dto';

describe('NewArrivalsService', () => {
  let service: NewArrivalsService;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let copyModel: jest.Mocked<Model<BookCopyDocument>>;

  const mockBook = {
    _id: '507f1f77bcf86cd799439011',
    title: 'New Science Book',
    author: 'Dr. Jane',
    workKey: 'wk-100',
    format: BookFormat.PHYSICAL,
    topic: 'science',
    language: 'en',
    availableCopies: 2,
    coverImageUrl: 'https://example.com/cover.jpg',
    createdAt: new Date('2026-08-25'),
  };

  const mockAggResult = [
    {
      results: [mockBook],
      totalCount: [{ count: 1 }],
    },
  ];

  beforeEach(async () => {
    bookModel = {
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAggResult),
      }),
    } as any;

    copyModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { bookId: '507f1f77bcf86cd799439099' },
          ]),
        }),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewArrivalsService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(BookCopy.name), useValue: copyModel },
      ],
    }).compile();

    service = module.get<NewArrivalsService>(NewArrivalsService);
  });

  describe('getNewArrivals', () => {
    it('should return new arrivals with pagination', async () => {
      const dto: NewArrivalsQueryDto = { days: 30, page: 1, limit: 20 };

      const result = await service.getNewArrivals(dto);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should exclude withdrawn copies from results', async () => {
      const dto: NewArrivalsQueryDto = { days: 30, page: 1, limit: 20 };

      await service.getNewArrivals(dto);

      expect(copyModel.find).toHaveBeenCalledWith({ status: CopyPhysicalStatus.WITHDRAWN });
    });

    it('should apply format filter when provided', async () => {
      const dto: NewArrivalsQueryDto = { days: 30, page: 1, limit: 20, format: BookFormat.EBOOK };

      await service.getNewArrivals(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.format).toBe(BookFormat.EBOOK);
    });

    it('should cap limit at 50', async () => {
      const dto: NewArrivalsQueryDto = { days: 30, page: 1, limit: 100 };

      const result = await service.getNewArrivals(dto);
      expect(result.limit).toBe(50);
    });

    it('should cap days at 365', async () => {
      const dto: NewArrivalsQueryDto = { days: 500, page: 1, limit: 20 };

      await service.getNewArrivals(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      const matchDate = pipeline[0].$match.createdAt.$gte;
      const daysDiff = Math.round((Date.now() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeLessThanOrEqual(366);
    });

    it('should return nextCursor when there are more results', async () => {
      const dto: NewArrivalsQueryDto = { days: 30, page: 1, limit: 1 };

      const result = await service.getNewArrivals(dto);
      expect(result.nextCursor).toBe(mockBook.createdAt.toISOString());
    });
  });
});
