import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { ExportCatalogQueryDto, ExportFormat } from '../dto/export-catalog-query.dto';

const BOOK_FIELDS = [
  'title',
  'author',
  'workKey',
  'format',
  'totalCopies',
  'availableCopies',
  'accessibility',
  'coverImageUrl',
];

@Injectable()
export class CatalogExportService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
  ) {}

  async exportCatalog(dto: ExportCatalogQueryDto): Promise<string | Record<string, unknown>[]> {
    const fieldsToSelect = dto.fieldsToInclude?.length
      ? dto.fieldsToInclude.join(' ')
      : BOOK_FIELDS.join(' ');

    const books = await this.bookModel
      .find()
      .select(fieldsToSelect)
      .lean()
      .exec();

    const rows = books.map((book) => {
      const row: Record<string, unknown> = {};
      const fields = dto.fieldsToInclude?.length ? dto.fieldsToInclude : BOOK_FIELDS;
      for (const field of fields) {
        row[field] = (book as Record<string, unknown>)[field];
      }
      return row;
    });

    if (dto.format === ExportFormat.JSON) {
      return rows;
    }

    return this.toCsv(rows);
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const lines = [headers.map((h) => this.escapeCsvField(h)).join(',')];

    for (const row of rows) {
      const values = headers.map((h) => this.escapeCsvField(String(row[h] ?? '')));
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private escapeCsvField(value: string): string {
    const sanitized = this.escapeFormulaInjection(value);
    if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  }

  private escapeFormulaInjection(value: string): string {
    if (!value) return value;
    const first = value.charAt(0);
    if (first === '=' || first === '+' || first === '-' || first === '@') {
      return `'${value}`;
    }
    return value;
  }
}
