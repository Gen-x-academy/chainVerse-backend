import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument } from '../schemas/book-copy.schema';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { Hold, HoldDocument } from '../schemas/hold.schema';
import { BookReview, BookReviewDocument } from '../schemas/book-review.schema';
import { DuplicateDetectionQueryDto } from '../dto/duplicate-detection-query.dto';
import { MergeRecordsDto } from '../dto/merge-records.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ResourceNotFoundException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

interface DuplicatePair {
  primaryBookId: string;
  duplicateBookId: string;
  score: number;
  matchedFields: string[];
}

@Injectable()
export class DuplicateDetectionService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name)
    private readonly holdModel: Model<HoldDocument>,
    @InjectModel(BookReview.name)
    private readonly reviewModel: Model<BookReviewDocument>,
  ) {}

  async detectDuplicates(dto: DuplicateDetectionQueryDto): Promise<DuplicatePair[]> {
    const threshold = dto.threshold ?? 0.8;
    const limit = dto.limit ?? 50;

    const allBooks = await this.bookModel.find().lean().exec();

    const pairs: DuplicatePair[] = [];

    for (let i = 0; i < allBooks.length; i++) {
      for (let j = i + 1; j < allBooks.length; j++) {
        const bookA = allBooks[i];
        const bookB = allBooks[j];

        const result = this.computeSimilarity(bookA, bookB);
        if (result.score >= threshold) {
          pairs.push({
            primaryBookId: String(bookA._id),
            duplicateBookId: String(bookB._id),
            score: result.score,
            matchedFields: result.matchedFields,
          });
        }
      }
    }

    pairs.sort((a, b) => b.score - a.score);
    return pairs.slice(0, limit);
  }

  async mergeRecords(dto: MergeRecordsDto): Promise<{ message: string; primaryBookId: string }> {
    if (dto.primaryBookId === dto.duplicateBookId) {
      throw new BusinessRuleException(
        'Cannot merge a record with itself',
        ErrorCode.BIZ_MERGE_SAME_RECORD,
      );
    }

    const [primary, duplicate] = await Promise.all([
      this.bookModel.findById(dto.primaryBookId).exec(),
      this.bookModel.findById(dto.duplicateBookId).exec(),
    ]);

    if (!primary) {
      throw new ResourceNotFoundException(
        'Primary book not found',
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }
    if (!duplicate) {
      throw new ResourceNotFoundException(
        'Duplicate book not found',
        ErrorCode.RES_BOOK_NOT_FOUND,
      );
    }

    const primaryId = new Types.ObjectId(dto.primaryBookId);
    const duplicateId = new Types.ObjectId(dto.duplicateBookId);

    await Promise.all([
      this.bookCopyModel.updateMany(
        { bookId: duplicateId },
        { $set: { bookId: primaryId } },
      ).exec(),
      this.loanModel.updateMany(
        { bookId: duplicateId },
        { $set: { bookId: primaryId } },
      ).exec(),
      this.holdModel.updateMany(
        { bookId: duplicateId },
        { $set: { bookId: primaryId } },
      ).exec(),
      this.reviewModel.updateMany(
        { bookId: duplicateId },
        { $set: { bookId: primaryId } },
      ).exec(),
    ]);

    primary.totalCopies += duplicate.totalCopies;
    primary.availableCopies += duplicate.availableCopies;
    await primary.save();

    await this.bookModel.findByIdAndDelete(dto.duplicateBookId).exec();

    return {
      message: 'Records merged successfully',
      primaryBookId: dto.primaryBookId,
    };
  }

  private computeSimilarity(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): { score: number; matchedFields: string[] } {
    const matchedFields: string[] = [];
    let totalWeight = 0;
    let matchWeight = 0;

    const isbnA = String(a.isbn ?? '').trim();
    const isbnB = String(b.isbn ?? '').trim();
    if (isbnA && isbnB) {
      totalWeight += 3;
      if (isbnA === isbnB) {
        matchWeight += 3;
        matchedFields.push('isbn');
      }
    }

    const titleA = this.normalizeString(String(a.title ?? ''));
    const titleB = this.normalizeString(String(b.title ?? ''));
    totalWeight += 2;
    const titleSim = this.stringSimilarity(titleA, titleB);
    matchWeight += titleSim * 2;
    if (titleSim > 0.8) matchedFields.push('title');

    const authorA = this.normalizeString(String(a.author ?? ''));
    const authorB = this.normalizeString(String(b.author ?? ''));
    totalWeight += 1;
    const authorSim = this.stringSimilarity(authorA, authorB);
    matchWeight += authorSim * 1;
    if (authorSim > 0.8) matchedFields.push('author');

    const formatA = String(a.format ?? '');
    const formatB = String(b.format ?? '');
    if (formatA && formatB) {
      totalWeight += 0.5;
      if (formatA === formatB) {
        matchWeight += 0.5;
        matchedFields.push('format');
      }
    }

    const score = totalWeight > 0 ? matchWeight / totalWeight : 0;
    return { score, matchedFields };
  }

  private normalizeString(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const bigramsA = this.getBigrams(a);
    const bigramsB = this.getBigrams(b);

    let intersectionSize = 0;
    const bBigramsCopy = [...bigramsB];
    for (const bg of bigramsA) {
      const idx = bBigramsCopy.indexOf(bg);
      if (idx !== -1) {
        intersectionSize++;
        bBigramsCopy.splice(idx, 1);
      }
    }

    return (2 * intersectionSize) / (bigramsA.length + bigramsB.length);
  }

  private getBigrams(s: string): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.push(s.substring(i, i + 2));
    }
    return bigrams;
  }
}
