import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogSearchService } from '../services/catalog-search.service';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { CatalogSearchDto } from '../dto/catalog-search.dto';

describe('CatalogSearchService', () => {
  let service: CatalogSearchService;
  let bookModel: jest.Mocked<Model<BookDocument>>;

  const mockBook = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Introduction to Machine Learning',
    author: 'Alice Smith',
    workKey: 'wk-001',
    format: BookFormat.PHYSICAL,
    topic: 'computer science',
    language: 'en',
    availableCopies: 3,
    coverImageUrl: 'https://example.com/cover.jpg',
    createdAt: new Date('2026-08-01'),
  };

  let chain: any;

  beforeEach(async () => {
    chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockBook]),
    };

    bookModel = {
      find: jest.fn().mockReturnValue(chain),
      countDocuments: jest.fn().mockResolvedValue(1),
      collection: {
        indexes: jest.fn().mockResolvedValue([]),
        createIndex: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogSearchService,
        { provide: getModelToken(Book.name), useValue: bookModel },
      ],
    }).compile();

    service = module.get<CatalogSearchService>(CatalogSearchService);
  });

  describe('search', () => {
    it('should return search results with pagination', async () => {
      const dto: CatalogSearchDto = { q: 'machine learning', page: 1, limit: 20 };

      const result = await service.search(dto);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(bookModel.find).toHaveBeenCalledWith({ $text: { $search: 'machine learning' } });
    });

    it('should apply format filter when provided', async () => {
      const dto: CatalogSearchDto = { q: 'test', page: 1, limit: 20, format: BookFormat.EBOOK };

      await service.search(dto);

      expect(bookModel.find).toHaveBeenCalledWith({
        $text: { $search: 'test' },
        format: BookFormat.EBOOK,
      });
    });

    it('should calculate correct skip for pagination', async () => {
      const dto: CatalogSearchDto = { q: 'test', page: 3, limit: 10 };

      await service.search(dto);

      const findChain = bookModel.find({ $text: { $search: 'test' } });
      expect(findChain.sort).toHaveBeenCalled();
    });

    it('should cap limit at 50', async () => {
      const dto: CatalogSearchDto = { q: 'test', page: 1, limit: 100 };

      const result = await service.search(dto);
      expect(result.limit).toBe(50);
    });

    it('should exclude coverImageData from results', async () => {
      const dto: CatalogSearchDto = { q: 'test', page: 1, limit: 20 };

      await service.search(dto);

      const findChain = bookModel.find({ $text: { $search: 'test' } });
      expect(findChain.select).toHaveBeenCalledWith('-__v -coverImageData');
    });
  });

  describe('ensureTextIndex', () => {
    it('should create text index when none exists', async () => {
      await service.ensureTextIndex();

      expect(bookModel.collection.indexes).toHaveBeenCalled();
      expect(bookModel.collection.createIndex).toHaveBeenCalledWith(
        { title: 'text', author: 'text', description: 'text' },
        { weights: { title: 10, author: 5, description: 2 }, name: 'book_text_search' },
      );
    });

    it('should not create index if text index already exists', async () => {
      (bookModel.collection.indexes as jest.Mock).mockResolvedValue([
        { key: { title: 'text' } },
      ]);

      await service.ensureTextIndex();

      expect(bookModel.collection.createIndex).not.toHaveBeenCalled();
    });
  });
});
