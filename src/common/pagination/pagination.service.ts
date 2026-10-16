import { Injectable } from '@nestjs/common';
import { Document, Model, SortOrder as MongoSortOrder } from 'mongoose';
import { PaginationDto } from '../dto/pagination.dto';
import { PaginatedResponse } from '../interfaces/pagination.interface';

/** Mongo sort direction; `1` ascending, `-1` descending. */
export type PaginationSort = Record<string, 1 | -1>;

@Injectable()
export class PaginationService {
  /**
   * Runs a page of `filter` and reports the total number of matches.
   *
   * @param paginationDto  `page` / `limit` / `sortBy` / `sortOrder`.
   * @param filter         Mongo filter; also used for the total count, so the
   *                       reported `total` always reflects the same query as
   *                       `data`.
   * @param transform      Optional projection applied to each returned document.
   * @param sort           Explicit sort spec, used instead of `sortBy`/`sortOrder`.
   *                       Callers paging over a field that is not unique (for
   *                       example `createdAt`) must include a unique tie-breaker
   *                       such as `_id`, otherwise MongoDB may return rows in a
   *                       different order on each page, which surfaces as
   *                       duplicated or missing items (#1249).
   */
  async paginate<T extends Document, R = T>(
    model: Model<T>,
    paginationDto: PaginationDto,
    filter: any = {},
    transform?: (item: T) => R,
    sort?: PaginationSort,
  ): Promise<PaginatedResponse<R>> {
    const { page = 1, limit = 10, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const query = model.find(filter);

    if (sort) {
      query.sort(sort as Record<string, MongoSortOrder>);
    } else if (sortBy && sortOrder) {
      query.sort({ [sortBy]: sortOrder });
    }

    const [data, total] = await Promise.all([
      query.skip(skip).limit(limit).exec(),
      model.countDocuments(filter),
    ]);

    const transformedData = transform ? data.map(transform) : (data as any);

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
