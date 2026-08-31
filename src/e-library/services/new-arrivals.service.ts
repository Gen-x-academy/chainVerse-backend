import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { NewArrivalsQueryDto } from '../dto/new-arrivals-query.dto';

@Injectable()
export class NewArrivalsService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name) private readonly copyModel: Model<BookCopyDocument>,
  ) {}

  async getNewArrivals(dto: NewArrivalsQueryDto) {
    const safeLimit = Math.min(Math.max(dto.limit ?? 20, 1), 50);
    const page = Math.max(dto.page ?? 1, 1);
    const skip = (page - 1) * safeLimit;
    const days = Math.min(Math.max(dto.days ?? 30, 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const withdrawnCopies = await this.copyModel
      .find({ status: CopyPhysicalStatus.WITHDRAWN })
      .select('bookId')
      .lean();

    const withdrawnBookIds = new Set(
      withdrawnCopies.map((c) => c.bookId.toString()),
    );

    const match: Record<string, any> = {
      createdAt: { $gte: since },
    };

    if (withdrawnBookIds.size > 0) {
      match._id = { $nin: Array.from(withdrawnBookIds).map((id) => new Types.ObjectId(id)) };
    }

    if (dto.format) {
      match.format = dto.format;
    }

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          results: [
            { $skip: skip },
            { $limit: safeLimit },
            { $project: { __v: 0, coverImageData: 0 } },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [agg] = await this.bookModel.aggregate(pipeline).exec();
    const total = agg.totalCount?.[0]?.count ?? 0;

    const items = agg.results.map((b: any) => ({
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
    }));

    const nextCursor =
      items.length === safeLimit
        ? items[items.length - 1].createdAt?.toISOString?.() ?? null
        : null;

    return {
      items,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      nextCursor,
    };
  }
}
