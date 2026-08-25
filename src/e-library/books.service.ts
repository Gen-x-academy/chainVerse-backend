import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { Book, BookDocument } from './schemas/book.schema';
import { CreateBookDto } from './dto/create-book.dto';

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
}
