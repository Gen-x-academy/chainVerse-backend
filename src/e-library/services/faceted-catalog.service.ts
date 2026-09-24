import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { FacetedSearchDto, AvailabilityFilter } from '../dto/faceted-search.dto';

@Injectable()
export class FacetedCatalogService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name) private readonly copyModel: Model<BookCopyDocument>,
  ) {}

  async searchWithFacets(dto: FacetedSearchDto) {
    const safeLimit = Math.min(Math.max(dto.limit ?? 20, 1), 50);
    const page = Math.max(dto.page ?? 1, 1);
    const skip = (page - 1) * safeLimit;

    const match: Record<string, any> = {};

    if (dto.q) {
      match.$text = { $search: dto.q };
    }

    if (dto.format) {
      const formats = dto.format.split(',').map((f) => f.trim()).filter(Boolean);
      if (formats.length === 1) {
        match.format = formats[0];
      } else if (formats.length > 1) {
        match.format = { $in: formats };
      }
    }

    if (dto.topic) {
      const topics = dto.topic.split(',').map((t) => t.trim()).filter(Boolean);
      if (topics.length === 1) {
        match.topic = topics[0];
      } else if (topics.length > 1) {
        match.topic = { $in: topics };
      }
    }

    if (dto.language) {
      const langs = dto.language.split(',').map((l) => l.trim()).filter(Boolean);
      if (langs.length === 1) {
        match.language = langs[0];
      } else if (langs.length > 1) {
        match.language = { $in: langs };
      }
    }

    if (dto.availability === AvailabilityFilter.AVAILABLE) {
      match.availableCopies = { $gt: 0 };
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $facet: {
          results: [
            ...(dto.q ? [{ $sort: { score: { $meta: 'textScore' }, _id: -1 } }] : [{ $sort: { createdAt: -1, _id: -1 } }]),
            { $skip: skip },
            { $limit: safeLimit },
            { $project: { __v: 0, coverImageData: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
          facetFormat: [
            { $group: { _id: '$format', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          facetTopic: [
            { $match: { topic: { $ne: '' } } },
            { $group: { _id: '$topic', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
          facetLanguage: [
            { $match: { language: { $ne: '' } } },
            { $group: { _id: '$language', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ];

    const [agg] = await this.bookModel.aggregate(pipeline).exec();

    const total = agg.totalCount?.[0]?.count ?? 0;

    return {
      items: agg.results.map((b: any) => ({
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
      facets: {
        format: Object.fromEntries(agg.facetFormat.map((f: any) => [f._id, f.count])),
        topic: Object.fromEntries(agg.facetTopic.map((f: any) => [f._id, f.count])),
        language: Object.fromEntries(agg.facetLanguage.map((f: any) => [f._id, f.count])),
      },
    };
  }
}
