import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FacetedCatalogService } from '../services/faceted-catalog.service';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument } from '../schemas/book-copy.schema';
import { FacetedSearchDto, AvailabilityFilter } from '../dto/faceted-search.dto';

describe('FacetedCatalogService', () => {
  let service: FacetedCatalogService;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let copyModel: jest.Mocked<Model<BookCopyDocument>>;

  const mockAggResult = [
    {
      results: [
        {
          _id: '507f1f77bcf86cd799439011',
          title: 'Introduction to Machine Learning',
          author: 'Alice Smith',
          workKey: 'wk-001',
          format: 'physical',
          topic: 'computer science',
          language: 'en',
          availableCopies: 3,
          coverImageUrl: 'https://example.com/cover.jpg',
          createdAt: new Date('2026-08-01'),
        },
      ],
      totalCount: [{ count: 1 }],
      facetFormat: [{ _id: 'physical', count: 1 }],
      facetTopic: [{ _id: 'computer science', count: 1 }],
      facetLanguage: [{ _id: 'en', count: 1 }],
    },
  ];

  beforeEach(async () => {
    bookModel = {
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAggResult),
      }),
    } as any;

    copyModel = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacetedCatalogService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(BookCopy.name), useValue: copyModel },
      ],
    }).compile();

    service = module.get<FacetedCatalogService>(FacetedCatalogService);
  });

  describe('searchWithFacets', () => {
    it('should return results with facets', async () => {
      const dto: FacetedSearchDto = { page: 1, limit: 20, availability: AvailabilityFilter.AVAILABLE };

      const result = await service.searchWithFacets(dto);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.facets.format).toEqual({ physical: 1 });
      expect(result.facets.topic).toEqual({ 'computer science': 1 });
      expect(result.facets.language).toEqual({ en: 1 });
    });

    it('should apply $text match when q is provided', async () => {
      const dto: FacetedSearchDto = { q: 'machine learning', page: 1, limit: 20, availability: AvailabilityFilter.ALL };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match).toHaveProperty('$text');
    });

    it('should parse comma-separated format filter', async () => {
      const dto: FacetedSearchDto = { format: 'physical,ebook', page: 1, limit: 20, availability: AvailabilityFilter.ALL };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.format).toEqual({ $in: ['physical', 'ebook'] });
    });

    it('should apply topic filter', async () => {
      const dto: FacetedSearchDto = { topic: 'science', page: 1, limit: 20, availability: AvailabilityFilter.ALL };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.topic).toBe('science');
    });

    it('should apply language filter', async () => {
      const dto: FacetedSearchDto = { language: 'en', page: 1, limit: 20, availability: AvailabilityFilter.ALL };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.language).toBe('en');
    });

    it('should filter by available copies when availability is available', async () => {
      const dto: FacetedSearchDto = { page: 1, limit: 20, availability: AvailabilityFilter.AVAILABLE };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.availableCopies).toEqual({ $gt: 0 });
    });

    it('should not filter by available copies when availability is all', async () => {
      const dto: FacetedSearchDto = { page: 1, limit: 20, availability: AvailabilityFilter.ALL };

      await service.searchWithFacets(dto);

      const pipeline = bookModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match).not.toHaveProperty('availableCopies');
    });
  });
});
