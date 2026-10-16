import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument } from '../schemas/book-copy.schema';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { Hold, HoldDocument } from '../schemas/hold.schema';
import { BookReview, BookReviewDocument } from '../schemas/book-review.schema';
import { DuplicateDetectionQueryDto } from '../dto/duplicate-detection-query.dto';
import { MergeRecordsDto } from '../dto/merge-records.dto';
import {
  ResourceNotFoundException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let bookCopyModel: jest.Mocked<Model<BookCopyDocument>>;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let reviewModel: jest.Mocked<Model<BookReviewDocument>>;

  const BOOK_A_ID = new Types.ObjectId();
  const BOOK_B_ID = new Types.ObjectId();
  const BOOK_C_ID = new Types.ObjectId();

  const mockBooks = [
    {
      _id: BOOK_A_ID,
      title: 'Dune',
      author: 'Frank Herbert',
      workKey: 'dune-frank-herbert',
      format: 'physical',
      isbn: '978-0441013593',
      totalCopies: 5,
      availableCopies: 3,
    },
    {
      _id: BOOK_B_ID,
      title: 'Dune',
      author: 'Frank Herbert',
      workKey: 'dune-frank-herbert-2',
      format: 'physical',
      isbn: '978-0441013593',
      totalCopies: 3,
      availableCopies: 2,
    },
    {
      _id: BOOK_C_ID,
      title: 'Neuromancer',
      author: 'William Gibson',
      workKey: 'neuromancer',
      format: 'ebook',
      isbn: '978-0441569595',
      totalCopies: 10,
      availableCopies: 10,
    },
  ];

  const makeMockQuery = (result: any) => ({
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(result),
    }),
    exec: jest.fn().mockResolvedValue(result),
    sort: jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
    select: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    bookModel = {
      find: jest.fn().mockReturnValue(makeMockQuery(mockBooks)),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
      findByIdAndDelete: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    } as any;

    bookCopyModel = {
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) }),
    } as any;

    loanModel = {
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) }),
    } as any;

    holdModel = {
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) }),
    } as any;

    reviewModel = {
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(BookCopy.name), useValue: bookCopyModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: getModelToken(BookReview.name), useValue: reviewModel },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
  });

  describe('detectDuplicates', () => {
    it('should detect duplicate books with same ISBN and title', async () => {
      const dto: DuplicateDetectionQueryDto = { threshold: 0.5, limit: 50 };
      const result = await service.detectDuplicates(dto);
      expect(Array.isArray(result)).toBe(true);
      const dunePair = result.find(
        (p) =>
          (p.primaryBookId === String(BOOK_A_ID) && p.duplicateBookId === String(BOOK_B_ID)) ||
          (p.primaryBookId === String(BOOK_B_ID) && p.duplicateBookId === String(BOOK_A_ID)),
      );
      expect(dunePair).toBeDefined();
      expect(dunePair!.score).toBeGreaterThanOrEqual(0.5);
      expect(dunePair!.matchedFields).toContain('isbn');
      expect(dunePair!.matchedFields).toContain('title');
    });

    it('should not flag dissimilar books', async () => {
      const dto: DuplicateDetectionQueryDto = { threshold: 0.9, limit: 50 };
      const result = await service.detectDuplicates(dto);
      const pair = result.find(
        (p) =>
          (p.primaryBookId === String(BOOK_A_ID) && p.duplicateBookId === String(BOOK_C_ID)) ||
          (p.primaryBookId === String(BOOK_C_ID) && p.duplicateBookId === String(BOOK_A_ID)),
      );
      expect(pair).toBeUndefined();
    });

    it('should respect limit parameter', async () => {
      const dto: DuplicateDetectionQueryDto = { threshold: 0.3, limit: 1 };
      const result = await service.detectDuplicates(dto);
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('mergeRecords', () => {
    it('should merge records by moving copies, loans, holds, reviews', async () => {
      const primaryBook = {
        _id: BOOK_A_ID,
        totalCopies: 5,
        availableCopies: 3,
        save: jest.fn().mockResolvedValue(true),
      };
      const duplicateBook = {
        _id: BOOK_B_ID,
        totalCopies: 3,
        availableCopies: 2,
      };

      bookModel.findById = jest.fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(primaryBook) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(duplicateBook) });
      bookModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const dto: MergeRecordsDto = {
        primaryBookId: String(BOOK_A_ID),
        duplicateBookId: String(BOOK_B_ID),
      };

      const result = await service.mergeRecords(dto);
      expect(result.message).toBe('Records merged successfully');
      expect(result.primaryBookId).toBe(String(BOOK_A_ID));

      expect(bookCopyModel.updateMany).toHaveBeenCalledWith(
        { bookId: BOOK_B_ID },
        { $set: { bookId: BOOK_A_ID } },
      );
      expect(loanModel.updateMany).toHaveBeenCalledWith(
        { bookId: BOOK_B_ID },
        { $set: { bookId: BOOK_A_ID } },
      );
      expect(holdModel.updateMany).toHaveBeenCalledWith(
        { bookId: BOOK_B_ID },
        { $set: { bookId: BOOK_A_ID } },
      );
      expect(reviewModel.updateMany).toHaveBeenCalledWith(
        { bookId: BOOK_B_ID },
        { $set: { bookId: BOOK_A_ID } },
      );

      expect(primaryBook.totalCopies).toBe(8);
      expect(primaryBook.availableCopies).toBe(5);
      expect(bookModel.findByIdAndDelete).toHaveBeenCalledWith(String(BOOK_B_ID));
    });

    it('should reject merging a record with itself', async () => {
      const dto: MergeRecordsDto = {
        primaryBookId: String(BOOK_A_ID),
        duplicateBookId: String(BOOK_A_ID),
      };

      await expect(service.mergeRecords(dto)).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should reject when primary book not found', async () => {
      bookModel.findById = jest.fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockBooks[1]) });

      const dto: MergeRecordsDto = {
        primaryBookId: String(BOOK_A_ID),
        duplicateBookId: String(BOOK_B_ID),
      };

      await expect(service.mergeRecords(dto)).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('should reject when duplicate book not found', async () => {
      bookModel.findById = jest.fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockBooks[0]) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });

      const dto: MergeRecordsDto = {
        primaryBookId: String(BOOK_A_ID),
        duplicateBookId: String(BOOK_B_ID),
      };

      await expect(service.mergeRecords(dto)).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });
});
