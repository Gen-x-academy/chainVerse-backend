import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { Book, BookDocument, BookStatus } from './schemas/book.schema';
import { UpdateBookDto } from './dto/update-book.dto';

@Injectable()
export class LibraryCatalogService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Issue #988 – ISBN lookup.
   * Calls the Open Library API and returns a draft book record prefilled
   * with the metadata. Saves a draft in the DB if the ISBN is new.
   */
  async lookupByIsbn(isbn: string): Promise<Book> {
    const existing = await this.bookModel.findOne({ isbn }).exec();
    if (existing) return existing;

    let metadata: Partial<Book>;
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const response = await firstValueFrom(
        this.httpService.get(url).pipe(
          timeout(5000),
          catchError(() => {
            throw new ServiceUnavailableException('ISBN provider unavailable');
          }),
        ),
      );
      const data = response.data[`ISBN:${isbn}`];
      if (!data) {
        // No result – return a minimal draft so librarian can fill it in
        metadata = { isbn, title: '', authors: [], status: BookStatus.DRAFT };
      } else {
        metadata = {
          isbn,
          title: data.title ?? '',
          authors: (data.authors ?? []).map((a: { name: string }) => a.name),
          publisher: data.publishers?.[0]?.name,
          publishedYear: data.publish_date ? parseInt(data.publish_date.slice(-4), 10) : undefined,
          description: data.notes ?? '',
          coverImageUrl: data.cover?.medium,
          status: BookStatus.DRAFT,
        };
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      // Malformed / unexpected response – return empty draft
      metadata = { isbn, title: '', authors: [], status: BookStatus.DRAFT };
    }

    const book = new this.bookModel(metadata);
    return book.save();
  }

  /**
   * Issue #986 – Metadata update with optimistic concurrency.
   * The caller must pass the current `revision`; if it no longer matches
   * the DB value we return 409 so the client can refresh and retry.
   */
  async updateMetadata(id: string, dto: UpdateBookDto): Promise<Book> {
    const book = await this.bookModel.findById(id).exec();
    if (!book) throw new NotFoundException('Book not found');

    if (book.revision !== dto.revision) {
      throw new ConflictException(
        `Stale revision: expected ${book.revision}, got ${dto.revision}. Refresh and retry.`,
      );
    }

    const { revision: _rev, ...fields } = dto;
    Object.assign(book, fields);
    book.revision += 1;
    return book.save();
  }

  async findOne(id: string): Promise<Book> {
    const book = await this.bookModel.findById(id).exec();
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }
}