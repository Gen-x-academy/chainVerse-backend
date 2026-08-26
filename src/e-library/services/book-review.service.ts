import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException, ResourceConflictException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  BookReview,
  BookReviewDocument,
  ReviewStatus,
} from '../schemas/book-review.schema';
import { ContentReport, ContentReportDocument } from '../schemas/content-report.schema';
import { CreateBookReviewDto } from '../dto/create-book-review.dto';
import { UpdateBookReviewDto } from '../dto/update-book-review.dto';

@Injectable()
export class BookReviewService {
  constructor(
    @InjectModel(BookReview.name)
    private readonly reviewModel: Model<BookReviewDocument>,
    @InjectModel(ContentReport.name)
    private readonly reportModel: Model<ContentReportDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(dto: CreateBookReviewDto, patronId: string): Promise<BookReviewDocument> {
    const existing = await this.reviewModel.findOne({
      bookId: dto.bookId,
      patronId,
    }).exec();
    if (existing) {
      throw new ResourceConflictException(
        'You have already reviewed this book',
        ErrorCode.BIZ_REVIEW_ALREADY_EXISTS,
      );
    }

    return this.reviewModel.create({
      bookId: dto.bookId,
      patronId,
      rating: dto.rating,
      title: dto.title,
      content: dto.content ?? '',
    });
  }

  async findById(reviewId: string): Promise<BookReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new ResourceNotFoundException(
        'Book review not found',
        ErrorCode.RES_BOOK_REVIEW_NOT_FOUND,
      );
    }
    return review;
  }

  async listByBook(bookId: string, paginationDto: PaginationDto) {
    return this.paginationService.paginate(
      this.reviewModel,
      paginationDto,
      { bookId, status: ReviewStatus.PUBLISHED },
    );
  }

  async update(
    reviewId: string,
    dto: UpdateBookReviewDto,
    patronId: string,
  ): Promise<BookReviewDocument> {
    const review = await this.findById(reviewId);
    if (review.patronId !== patronId) {
      throw new ResourceNotFoundException(
        'Book review not found',
        ErrorCode.RES_BOOK_REVIEW_NOT_FOUND,
      );
    }
    if (review.status === ReviewStatus.REMOVED) {
      throw new ResourceNotFoundException(
        'Book review not found',
        ErrorCode.RES_BOOK_REVIEW_NOT_FOUND,
      );
    }

    const update: Record<string, unknown> = {};
    if (dto.rating !== undefined) update.rating = dto.rating;
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.content !== undefined) update.content = dto.content;

    Object.assign(review, update);
    return review.save();
  }

  async moderateStatus(
    reviewId: string,
    status: ReviewStatus,
  ): Promise<BookReviewDocument> {
    const review = await this.findById(reviewId);
    review.status = status;
    return review.save();
  }

  async incrementReportCount(reviewId: string): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: reviewId },
      { $inc: { reportCount: 1 } },
    ).exec();
  }
}
