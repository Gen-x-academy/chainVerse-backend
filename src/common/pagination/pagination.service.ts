import { Injectable } from '@nestjs/common';
import { Document, Model } from 'mongoose';
import { PaginationDto } from '../dto/pagination.dto';
import { PaginatedResponse } from '../interfaces/pagination.interface';

@Injectable()
export class PaginationService {
  async paginate<T extends Document, R = T>(
    model: Model<T>,
    paginationDto: PaginationDto,
    filter: any = {},
    transform?: (item: T) => R,
  ): Promise<PaginatedResponse<R>> {
    const { page = 1, limit = 10, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const query = model.find(filter);

    if (sortBy && sortOrder) {
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
