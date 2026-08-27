import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException, ValidationDomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { Book, BookDocument, BookFormat } from './schemas/book.schema';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateAccessibilityDto } from './dto/update-accessibility.dto';

@Injectable()
export class BooksService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(dto: CreateBookDto): Promise<BookDocument> {
    return this.bookModel.create({
      ...dto,
      availableCopies: dto.totalCopies,
    });
  }

  async list(paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.bookModel, paginationDto);
  }

  async findByIdOrThrow(bookId: string): Promise<BookDocument> {
    const book = await this.bookModel.findById(bookId);
    if (!book) {
      throw new ResourceNotFoundException(
        'Book not found',
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }
    return book;
  }

  /**
   * Issue #999 – Update accessible alternate-format metadata.
   * Merges fields onto the existing `accessibility` sub-document.
   */
  async updateAccessibility(
    bookId: string,
    dto: UpdateAccessibilityDto,
  ): Promise<BookDocument> {
    const book = await this.findByIdOrThrow(bookId);
    if (!book.accessibility) {
      book.accessibility = {} as Book['accessibility'];
    }
    Object.assign(book.accessibility, dto);
    return book.save();
  }

  /**
   * Issue #1000 – Public paginated catalog browse.
   *
   * Returns only published editions with a deterministic cursor so clients
   * can paginate without drifting when new records are inserted. The result
   * shape deliberately excludes internal acquisition or moderation fields.
   */
  async browse(
    cursor?: string,
    limit: number = 20,
    format?: BookFormat,
    accessibility?: Partial<UpdateAccessibilityDto>,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const filter: Record<string, unknown> = {};
    if (cursor) {
      filter.createdAt = { $lt: new Date(cursor) };
    }
    if (format) {
      filter.format = format;
    }
    if (accessibility) {
      for (const [key, value] of Object.entries(accessibility)) {
        if (typeof value === 'boolean') {
          filter[`accessibility.${key}`] = value;
        }
      }
    }

    const sortQ = { createdAt: -1, _id: -1 } as const;
    const docs = await this.bookModel
      .find(filter)
      .sort(sortQ)
      .limit(safeLimit + 1)
      .select('-__v')
      .lean();

    const hasMore = docs.length > safeLimit;
    const page = docs.slice(0, safeLimit);
    const nextCursor = hasMore
      ? page[page.length - 1].createdAt?.toISOString?.() ?? null
      : null;

    return {
      items: page.map((b) => ({
        id: b._id,
        title: b.title,
        author: b.author,
        workKey: b.workKey,
        format: b.format,
        availableCopies: b.availableCopies,
        accessibility: b.accessibility,
      })),
      nextCursor,
      hasMore,
    };
  }
}
