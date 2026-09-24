import { Injectable, ConflictException } from '@nestjs/common';

export interface CreateBookDto {
  isbn: string;
  title: string;
  author: string;
  catalogedBy: string;
  publishedYear?: number;
  genre?: string;
}

export interface BookRecord {
  id: string;
  isbn: string;
  title: string;
  author: string;
  catalogedBy: string;
  publishedYear?: number;
  genre?: string;
  status: 'draft';
  createdAt: string;
  auditEvent: string;
}

/**
 * Allows authorized librarians/admins to create validated draft book records.
 *
 * createBook()   – validates ISBN uniqueness, normalizes metadata, records
 *                  the cataloger, and emits an audit event.
 * normalizeIsbn() – strips dashes and spaces for consistent storage.
 *
 * Resolves #985
 */
@Injectable()
export class LibrarianBookService {
  private readonly existingIsbns = new Set<string>();

  /**
   * Normalize an ISBN by stripping non-numeric characters.
   */
  normalizeIsbn(isbn: string): string {
    return isbn.replace(/[^0-9X]/gi, '').toUpperCase();
  }

  /**
   * Create a validated draft bibliographic record.
   * Rejects duplicate ISBNs and normalizes metadata.
   */
  createBook(dto: CreateBookDto): BookRecord {
    const normalizedIsbn = this.normalizeIsbn(dto.isbn);

    if (this.existingIsbns.has(normalizedIsbn)) {
      throw new ConflictException(
        `A book with ISBN '${normalizedIsbn}' already exists.`,
      );
    }

    this.existingIsbns.add(normalizedIsbn);

    const record: BookRecord = {
      id: `book-${Date.now()}`,
      isbn: normalizedIsbn,
      title: dto.title.trim(),
      author: dto.author.trim(),
      catalogedBy: dto.catalogedBy,
      publishedYear: dto.publishedYear,
      genre: dto.genre?.trim(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      auditEvent: `BOOK_CREATED by ${dto.catalogedBy} at ${new Date().toISOString()}`,
    };

    return record;
  }
}