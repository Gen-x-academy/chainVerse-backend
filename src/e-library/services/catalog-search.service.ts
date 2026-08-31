import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { Book, BookDocument } from '../schemas/book.schema';
import { CatalogSearchDto } from '../dto/catalog-search.dto';

@Injectable()
export class CatalogSearchService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSearchService.name);

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTextIndex();
    } catch (err) {
      this.logger.warn('Unable to ensure text index during init', err);
    }
  }

  async ensureTextIndex(): Promise<void> {
    const indexes = await this.bookModel.collection.indexes();
    const hasText = indexes.some((idx: any) =>
      Object.values(idx.key).some((v: any) => v === 'text'),
    );
    if (!hasText) {
      await this.bookModel.collection.createIndex(
        { title: 'text', author: 'text', description: 'text' },
        { weights: { title: 10, author: 5, description: 2 }, name: 'book_text_search' },
      );
    }
  }

  async search(dto: CatalogSearchDto) {
    const safeLimit = Math.min(Math.max(dto.limit ?? 20, 1), 50);
    const page = Math.max(dto.page ?? 1, 1);
    const skip = (page - 1) * safeLimit;

    const filter: Record<string, any> = {
      $text: { $search: dto.q },
    };

    if (dto.format) {
      filter.format = dto.format;
    }

    const [items, total] = await Promise.all([
      this.bookModel
        .find(filter)
        .sort({ score: { $meta: 'textScore' }, _id: -1 })
        .skip(skip)
        .limit(safeLimit)
        .select('-__v -coverImageData')
        .lean(),
      this.bookModel.countDocuments(filter),
    ]);

    return {
      items: items.map((b) => ({
        id: b._id,
        title: b.title,
        author: b.author,
        workKey: b.workKey,
        format: b.format,
        topic: b.topic,
        language: b.language,
        availableCopies: b.availableCopies,
        coverImageUrl: b.coverImageUrl,
        createdAt: b.createdAt,
      })),
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
