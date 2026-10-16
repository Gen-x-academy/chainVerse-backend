import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Series, SeriesDocument } from '../schemas/series.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateVolumeDto } from '../dto/update-volume.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { isDuplicateKeyError } from '../e-library.util';

type LeanBook = {
  _id: unknown;
  title: string;
  author: string;
  format: string;
  workKey: string;
  volumeNumber?: number;
  volumeLabel?: string;
  availableCopies: number;
};

function volumeSortKey(book: LeanBook): [number, number, string] {
  if (book.volumeNumber !== undefined && book.volumeNumber !== null) {
    return [0, book.volumeNumber, ''];
  }
  return [1, 0, book.volumeLabel ?? ''];
}

function compareVolumes(a: LeanBook, b: LeanBook): number {
  const ka = volumeSortKey(a);
  const kb = volumeSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return String(ka[2]).localeCompare(String(kb[2]));
}

@Injectable()
export class SeriesService {
  constructor(
    @InjectModel(Series.name) private readonly seriesModel: Model<SeriesDocument>,
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async createSeries(dto: CreateSeriesDto): Promise<SeriesDocument> {
    try {
      return await this.seriesModel.create({
        name: dto.name,
        description: dto.description ?? '',
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ResourceConflictException(
          'A series with this name already exists',
          ErrorCode.RES_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  async findAll(paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.seriesModel, paginationDto);
  }

  async findOne(seriesId: string): Promise<SeriesDocument> {
    const series = await this.seriesModel.findById(seriesId).exec();
    if (!series) {
      throw new ResourceNotFoundException(
        'Series not found',
        ErrorCode.RES_SERIES_NOT_FOUND,
      );
    }
    return series;
  }

  async assignBookToSeries(
    bookId: string,
    dto: UpdateVolumeDto,
  ): Promise<BookDocument> {
    const book = await this.bookModel.findById(bookId).exec();
    if (!book) {
      throw new ResourceNotFoundException(
        'Book not found',
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }

    if (dto.seriesId) {
      const series = await this.seriesModel.findById(dto.seriesId).exec();
      if (!series) {
        throw new ResourceNotFoundException(
          'Series not found',
          ErrorCode.RES_SERIES_NOT_FOUND,
        );
      }
      if (book.seriesId && String(book.seriesId) !== dto.seriesId) {
        throw new BusinessRuleException(
          'Book is already part of another series',
          ErrorCode.BIZ_BOOK_ALREADY_IN_SERIES,
        );
      }
      book.seriesId = new Types.ObjectId(dto.seriesId);
    }

    if (dto.volumeNumber !== undefined) {
      book.volumeNumber = dto.volumeNumber;
    }
    if (dto.volumeLabel !== undefined) {
      book.volumeLabel = dto.volumeLabel;
    }

    return book.save();
  }

  async getSeriesBooks(seriesId: string) {
    const series = await this.findOne(seriesId);

    const books = (await this.bookModel
      .find({ seriesId: new Types.ObjectId(seriesId) })
      .select('-__v')
      .lean()) as unknown as LeanBook[];

    const sorted = [...books].sort(compareVolumes);

    const items = sorted.map((book, index) => {
      const prev = index > 0 ? sorted[index - 1] : undefined;
      const next = index < sorted.length - 1 ? sorted[index + 1] : undefined;
      return {
        id: book._id,
        title: book.title,
        author: book.author,
        format: book.format,
        workKey: book.workKey,
        volumeNumber: book.volumeNumber,
        volumeLabel: book.volumeLabel,
        availableCopies: book.availableCopies,
        previousVolume: prev
          ? {
              id: prev._id,
              title: prev.title,
              volumeNumber: prev.volumeNumber,
              volumeLabel: prev.volumeLabel,
            }
          : null,
        nextVolume: next
          ? {
              id: next._id,
              title: next.title,
              volumeNumber: next.volumeNumber,
              volumeLabel: next.volumeLabel,
            }
          : null,
      };
    });

    return {
      series: {
        id: series._id,
        name: series.name,
        description: series.description,
      },
      items,
    };
  }
}
