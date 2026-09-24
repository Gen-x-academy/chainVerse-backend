import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BooksService } from '../books.service';
import { Book, BookDocument } from '../schemas/book.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

describe('BooksService', () => {
  let service: BooksService;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let paginationService: jest.Mocked<PaginationService>;

  const mockBook = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Test Book',
    author: 'Test Author',
    workKey: 'work-1',
    format: 'ebook',
    totalCopies: 5,
    availableCopies: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    bookModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      exists: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    } as any;

    paginationService = {
      paginate: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  describe('create', () => {
    it('should create a book with availableCopies set to totalCopies', async () => {
      const dto = {
        title: 'Test Book',
        author: 'Test Author',
        workKey: 'work-1',
        format: 'ebook' as const,
        totalCopies: 5,
      };
      bookModel.create.mockResolvedValue(mockBook as any);

      const result = await service.create(dto);

      expect(bookModel.create).toHaveBeenCalledWith({
        ...dto,
        availableCopies: 5,
      });
      expect(result).toEqual(mockBook);
    });
  });

  describe('list', () => {
    it('should delegate to pagination service', async () => {
      const paginationDto = { page: 1, limit: 10 };
      const paginatedResult = { data: [mockBook], total: 1, page: 1 };
      paginationService.paginate.mockResolvedValue(paginatedResult as any);

      const result = await service.list(paginationDto as any);

      expect(paginationService.paginate).toHaveBeenCalledWith(
        bookModel,
        paginationDto,
      );
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findByIdOrThrow', () => {
    it('should return a book when found', async () => {
      bookModel.findById.mockResolvedValue(mockBook as any);

      const result = await service.findByIdOrThrow(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toEqual(mockBook);
    });

    it('should throw ResourceNotFoundException when book not found', async () => {
      bookModel.findById.mockResolvedValue(null);

      await expect(
        service.findByIdOrThrow('507f1f77bcf86cd799439099'),
      ).rejects.toThrow(ResourceNotFoundException);
    });
  });
});
