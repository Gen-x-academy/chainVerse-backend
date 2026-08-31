import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { Book, BookDocument } from '../schemas/book.schema';
import { AutocompleteQueryDto, AutocompleteField } from '../dto/autocomplete-query.dto';

@Injectable()
export class AutocompleteService {
  private static readonly FIELD_MAP: Record<AutocompleteField, string> = {
    [AutocompleteField.TITLE]: 'title',
    [AutocompleteField.AUTHOR]: 'author',
    [AutocompleteField.SUBJECT]: 'topic',
    [AutocompleteField.ISBN]: 'isbn',
  };

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
  ) {}

  async suggest(dto: AutocompleteQueryDto): Promise<string[]> {
    const fieldName = AutocompleteService.FIELD_MAP[dto.field];
    if (!fieldName) {
      throw new BusinessRuleException(
        `Invalid search field: ${dto.field}`,
        ErrorCode.BIZ_INVALID_SEARCH_FIELD,
      );
    }

    const safeLimit = Math.min(Math.max(dto.limit ?? 10, 1), 25);
    const normalized = dto.q.trim().replace(/\s+/g, ' ');
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}`, 'i');

    const docs = await this.bookModel
      .find({ [fieldName]: regex })
      .select(fieldName)
      .limit(safeLimit * 3)
      .lean();

    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const doc of docs) {
      const value = (doc as any)[fieldName];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      suggestions.push(trimmed);
      if (suggestions.length >= safeLimit) break;
    }

    return suggestions;
  }
}
