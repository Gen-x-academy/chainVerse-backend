import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from './schemas/book.schema';
import { BookCopy, BookCopyDocument } from './schemas/book-copy.schema';
import {
  LibraryClosure,
  LibraryClosureDocument,
} from './schemas/library-closure.schema';
import { CopyStatus } from './enums/copy-status.enum';
import { CreateBookDto } from './dto/create-book.dto';
import { CreateBookCopyDto } from './dto/create-book-copy.dto';
import { CreateClosureDto } from './dto/create-closure.dto';
import { normalizeToUtcMidnight } from './utils/pickup-window.util';

@Injectable()
export class LibraryCatalogService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    @InjectModel(LibraryClosure.name)
    private readonly closureModel: Model<LibraryClosureDocument>,
  ) {}

  async createBook(dto: CreateBookDto): Promise<Book> {
    const book = await new this.bookModel({
      title: dto.title,
      author: dto.author,
      isbn: dto.isbn,
      type: dto.type,
      totalCopies: dto.totalCopies,
      maxActiveHoldsPerUser: dto.maxActiveHoldsPerUser ?? 3,
      pickupWindowDays: dto.pickupWindowDays ?? 3,
    }).save();

    if (dto.totalCopies > 0) {
      const copies = Array.from({ length: dto.totalCopies }, (_, i) => ({
        bookId: book.id,
        identifier: `${book.id}-C${i + 1}`,
        status: CopyStatus.AVAILABLE,
      }));
      await this.bookCopyModel.insertMany(copies);
    }

    return book;
  }

  async listBooks(): Promise<Book[]> {
    return this.bookModel.find({ isActive: true }).sort({ title: 1 }).exec();
  }

  async getBook(bookId: string): Promise<BookDocument> {
    const book = await this.bookModel.findById(bookId).exec();
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  async addCopy(bookId: string, dto: CreateBookCopyDto): Promise<BookCopy> {
    const book = await this.getBook(bookId);
    const identifier = dto.identifier ?? `${book.id}-C${Date.now()}`;

    const existing = await this.bookCopyModel.findOne({ identifier }).exec();
    if (existing) {
      throw new ConflictException('A copy with this identifier already exists');
    }

    const copy = new this.bookCopyModel({
      bookId: book.id,
      identifier,
      status: CopyStatus.AVAILABLE,
    });
    await copy.save();
    await this.bookModel
      .updateOne({ _id: book.id }, { $inc: { totalCopies: 1 } })
      .exec();

    return copy;
  }

  async listCopies(bookId: string): Promise<BookCopy[]> {
    await this.getBook(bookId);
    return this.bookCopyModel.find({ bookId }).sort({ identifier: 1 }).exec();
  }

  async createClosure(dto: CreateClosureDto): Promise<LibraryClosure> {
    const date = normalizeToUtcMidnight(dto.date);
    const existing = await this.closureModel.findOne({ date }).exec();
    if (existing) {
      throw new ConflictException('A closure already exists for this date');
    }
    const closure = new this.closureModel({ date, reason: dto.reason });
    return closure.save();
  }

  async listClosures(): Promise<LibraryClosure[]> {
    return this.closureModel.find().sort({ date: 1 }).exec();
  }
}
