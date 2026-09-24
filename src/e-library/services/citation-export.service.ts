import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { SavedList, SavedListDocument } from '../schemas/saved-list.schema';
import { CitationFormat } from '../dto/citation-export-query.dto';
import {
  formatCitation,
  MissingCitationField,
} from './citation-formatter';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';

export interface CitationExportEntry {
  bookId: string;
  citation: string;
  missing: MissingCitationField[];
}

export interface CitationExportResult {
  format: CitationFormat;
  citations: CitationExportEntry[];
}

@Injectable()
export class CitationExportService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(SavedList.name)
    private readonly savedListModel: Model<SavedListDocument>,
  ) {}

  async exportCatalogCitations(
    ids: string[],
    format: CitationFormat,
  ): Promise<CitationExportResult> {
    if (ids.length === 0) {
      return { format, citations: [] };
    }

    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const books = await this.bookModel
      .find({ _id: { $in: objectIds } })
      .lean()
      .exec();

    const byId = new Map(books.map((book) => [String(book._id), book]));
    const found: string[] = [];
    const citations: CitationExportEntry[] = [];

    for (const id of ids) {
      const book = byId.get(id);
      if (!book) continue;
      found.push(id);
      const result = formatCitation(format, {
        bookId: id,
        workKey: book.workKey,
        title: book.title,
        author: book.author,
        publisher: book.publisher || undefined,
        publicationYear: book.publicationYear,
        editionLabel: book.editionLabel || undefined,
        volumeLabel: book.volumeLabel || undefined,
        isbn: book.isbn || undefined,
      });
      citations.push({ bookId: id, citation: result.citation, missing: result.missing });
    }

    const missingIds = ids.filter((id) => !found.includes(id));
    if (missingIds.length > 0) {
      throw new ResourceNotFoundException(
        `No catalog record found for book id(s): ${missingIds.join(', ')}`,
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }

    return { format, citations };
  }

  async exportReadingListCitations(
    listId: string,
    ownerId: string,
    format: CitationFormat,
  ): Promise<CitationExportResult> {
    if (!Types.ObjectId.isValid(listId)) {
      throw new ResourceNotFoundException(
        'Reading list not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }

    const list = await this.savedListModel.findById(listId).lean().exec();
    if (!list) {
      throw new ResourceNotFoundException(
        'Reading list not found',
        ErrorCode.RES_NOT_FOUND,
      );
    }

    if (list.patronId !== ownerId) {
      throw new ForbiddenDomainException(
        'You can only export citations from your own reading lists',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    const bookIds = list.items.map((item) => item.bookId);
    if (bookIds.length === 0) {
      return { format, citations: [] };
    }

    const validIds = bookIds.filter((id) => Types.ObjectId.isValid(id));
    const books = validIds.length
      ? await this.bookModel
          .find({ _id: { $in: validIds.map((id) => new Types.ObjectId(id)) } })
          .lean()
          .exec()
      : [];

    const byId = new Map(books.map((book) => [String(book._id), book]));
    const citations: CitationExportEntry[] = [];

    for (const bookId of bookIds) {
      const book = byId.get(bookId);
      if (!book) continue;
      const result = formatCitation(format, {
        bookId,
        workKey: book.workKey,
        title: book.title,
        author: book.author,
        publisher: book.publisher || undefined,
        publicationYear: book.publicationYear,
        editionLabel: book.editionLabel || undefined,
        volumeLabel: book.volumeLabel || undefined,
        isbn: book.isbn || undefined,
      });
      citations.push({ bookId, citation: result.citation, missing: result.missing });
    }

    return { format, citations };
  }
}