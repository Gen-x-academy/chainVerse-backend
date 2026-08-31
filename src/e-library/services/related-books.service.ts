import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book } from '../schemas/book.schema';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

@Injectable()
export class RelatedBooksService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
  ) {}

  async getRelatedBooks(bookId: string, limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    const source = await this.bookModel.findById(bookId).lean().exec();
    if (!source) {
      throw new ResourceNotFoundException(
        'Book not found',
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }

    const topic = source.topic?.trim();
    const filter: Record<string, unknown> = {
      _id: { $ne: source._id },
      availableCopies: { $gt: 0 },
    };
    if (topic) {
      filter.$or = [{ topic }, { format: source.format }];
    } else {
      filter.format = source.format;
    }

    const books = await this.bookModel.find(filter).select('-__v').lean();

    const ranked = books
      .map((book) => ({
        book,
        sharedTopic: topic ? book.topic?.trim() === topic : false,
      }))
      .sort(
        (a, b) =>
          Number(b.sharedTopic) - Number(a.sharedTopic) ||
          String(a.book.title).localeCompare(String(b.book.title)),
      );

    return {
      sourceId: bookId,
      items: ranked.slice(0, safeLimit).map(({ book }) => this.toSummary(book)),
    };
  }

  async getSameAuthorBooks(author: string, limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const books = await this.bookModel
      .find({ author })
      .sort({ createdAt: 1, _id: 1 })
      .select('-__v')
      .lean();

    return {
      author,
      items: books.slice(0, safeLimit).map((book) => this.toSummary(book)),
    };
  }

  private toSummary(book: Record<string, unknown>) {
    return {
      id: book._id,
      title: book.title,
      author: book.author,
      format: book.format,
      workKey: book.workKey,
      availableCopies: book.availableCopies,
    };
  }
}
