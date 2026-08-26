import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import { Hold, HoldDocument, HoldStatus } from '../schemas/hold.schema';
import { BookCopy, BookCopyDocument, CopyStatus } from '../schemas/book-copy.schema';

export interface ReadingListReportQuery {
  courseId?: string;
  tutorId?: string;
  from?: string;
  to?: string;
  reportType?: string;
  limit?: number;
}

export interface ReadingListItem {
  bookId: string;
  title: string;
  author: string;
  format: string;
  totalCopies: number;
  availableCopies: number;
  activeLoans: number;
  pendingHolds: number;
  utilizationRate: number;
  availabilityStatus: 'available' | 'limited' | 'unavailable';
}

export interface ReadingListSummary {
  courseId: string;
  totalBooks: number;
  booksWithAvailability: number;
  booksLimited: number;
  booksUnavailable: number;
  totalActiveLoans: number;
  totalPendingHolds: number;
  overallUtilization: number;
  items: ReadingListItem[];
}

export interface TutorReadingListReport {
  tutorId: string;
  courses: ReadingListSummary[];
  totalBooksAcrossCourses: number;
  overallAvailabilityRate: number;
}

@Injectable()
export class ReadingListReportService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name)
    private readonly holdModel: Model<HoldDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
  ) {}

  async getReadingListReport(query: ReadingListReportQuery) {
    const reportType = query.reportType ?? 'availability';
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;

    switch (reportType) {
      case 'availability':
        return this.getAvailabilityReport(query.courseId!, now);
      case 'borrowing':
        return this.getBorrowingReport(query.courseId!, from, to);
      case 'tutor_summary':
        return this.getTutorSummary(query.tutorId!, from, to, now);
      default:
        return this.getAvailabilityReport(query.courseId!, now);
    }
  }

  async getAvailabilityReport(
    courseId: string,
    now: Date,
  ): Promise<ReadingListSummary> {
    const books = await this.bookModel
      .find({ workKey: { $regex: courseId, $options: 'i' } })
      .lean()
      .exec();

    const items: ReadingListItem[] = [];
    let totalActiveLoans = 0;
    let totalPendingHolds = 0;

    for (const book of books) {
      const activeLoans = await this.loanModel
        .countDocuments({
          bookId: book._id,
          status: { $in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] },
        })
        .exec();

      const pendingHolds = await this.holdModel
        .countDocuments({
          bookId: book._id,
          status: { $in: [HoldStatus.PENDING, HoldStatus.READY] },
        })
        .exec();

      const utilizationRate =
        book.totalCopies > 0
          ? (book.totalCopies - book.availableCopies) / book.totalCopies
          : 0;

      let availabilityStatus: 'available' | 'limited' | 'unavailable' = 'available';
      if (book.availableCopies === 0) {
        availabilityStatus = 'unavailable';
      } else if (book.availableCopies <= 1 || utilizationRate >= 0.8) {
        availabilityStatus = 'limited';
      }

      totalActiveLoans += activeLoans;
      totalPendingHolds += pendingHolds;

      items.push({
        bookId: book._id.toString(),
        title: book.title,
        author: book.author,
        format: book.format,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        activeLoans,
        pendingHolds,
        utilizationRate: Math.round(utilizationRate * 10000) / 10000,
        availabilityStatus,
      });
    }

    const booksWithAvailability = items.filter(
      (i) => i.availabilityStatus === 'available',
    ).length;
    const booksLimited = items.filter(
      (i) => i.availabilityStatus === 'limited',
    ).length;
    const booksUnavailable = items.filter(
      (i) => i.availabilityStatus === 'unavailable',
    ).length;

    const totalCopies = items.reduce((sum, i) => sum + i.totalCopies, 0);
    const totalAvailable = items.reduce((sum, i) => sum + i.availableCopies, 0);
    const overallUtilization =
      totalCopies > 0 ? (totalCopies - totalAvailable) / totalCopies : 0;

    return {
      courseId,
      totalBooks: books.length,
      booksWithAvailability,
      booksLimited,
      booksUnavailable,
      totalActiveLoans,
      totalPendingHolds,
      overallUtilization: Math.round(overallUtilization * 10000) / 10000,
      items,
    };
  }

  async getBorrowingReport(
    courseId: string,
    from: Date,
    to: Date,
  ): Promise<ReadingListSummary> {
    const books = await this.bookModel
      .find({ workKey: { $regex: courseId, $options: 'i' } })
      .lean()
      .exec();

    const items: ReadingListItem[] = [];
    let totalActiveLoans = 0;
    let totalPendingHolds = 0;

    for (const book of books) {
      const activeLoans = await this.loanModel
        .countDocuments({
          bookId: book._id,
          checkedOutAt: { $gte: from, $lte: to },
        })
        .exec();

      const pendingHolds = await this.holdModel
        .countDocuments({
          bookId: book._id,
          requestedAt: { $gte: from, $lte: to },
        })
        .exec();

      const utilizationRate =
        book.totalCopies > 0
          ? (book.totalCopies - book.availableCopies) / book.totalCopies
          : 0;

      let availabilityStatus: 'available' | 'limited' | 'unavailable' = 'available';
      if (book.availableCopies === 0) {
        availabilityStatus = 'unavailable';
      } else if (book.availableCopies <= 1 || utilizationRate >= 0.8) {
        availabilityStatus = 'limited';
      }

      totalActiveLoans += activeLoans;
      totalPendingHolds += pendingHolds;

      items.push({
        bookId: book._id.toString(),
        title: book.title,
        author: book.author,
        format: book.format,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        activeLoans,
        pendingHolds,
        utilizationRate: Math.round(utilizationRate * 10000) / 10000,
        availabilityStatus,
      });
    }

    const booksWithAvailability = items.filter(
      (i) => i.availabilityStatus === 'available',
    ).length;
    const booksLimited = items.filter(
      (i) => i.availabilityStatus === 'limited',
    ).length;
    const booksUnavailable = items.filter(
      (i) => i.availabilityStatus === 'unavailable',
    ).length;

    const totalCopies = items.reduce((sum, i) => sum + i.totalCopies, 0);
    const totalAvailable = items.reduce((sum, i) => sum + i.availableCopies, 0);
    const overallUtilization =
      totalCopies > 0 ? (totalCopies - totalAvailable) / totalCopies : 0;

    return {
      courseId,
      totalBooks: books.length,
      booksWithAvailability,
      booksLimited,
      booksUnavailable,
      totalActiveLoans,
      totalPendingHolds,
      overallUtilization: Math.round(overallUtilization * 10000) / 10000,
      items,
    };
  }

  async getTutorSummary(
    tutorId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<TutorReadingListReport> {
    const courses = await this.getTutorCourses(tutorId);

    const courseSummaries: ReadingListSummary[] = [];
    let totalBooksAcrossCourses = 0;
    let totalAvailableAcrossCourses = 0;
    let totalCopiesAcrossCourses = 0;

    for (const courseId of courses) {
      const summary = await this.getAvailabilityReport(courseId, now);
      courseSummaries.push(summary);
      totalBooksAcrossCourses += summary.totalBooks;
      totalCopiesAcrossCourses += summary.items.reduce(
        (sum, i) => sum + i.totalCopies,
        0,
      );
      totalAvailableAcrossCourses += summary.items.reduce(
        (sum, i) => sum + i.availableCopies,
        0,
      );
    }

    const overallAvailabilityRate =
      totalCopiesAcrossCourses > 0
        ? totalAvailableAcrossCourses / totalCopiesAcrossCourses
        : 0;

    return {
      tutorId,
      courses: courseSummaries,
      totalBooksAcrossCourses,
      overallAvailabilityRate: Math.round(overallAvailabilityRate * 10000) / 10000,
    };
  }

  private async getTutorCourses(tutorId: string): Promise<string[]> {
    const books = await this.bookModel
      .find()
      .select('workKey')
      .lean()
      .exec();

    const courseIds = new Set<string>();
    for (const book of books) {
      if (book.workKey && book.workKey.includes('-')) {
        const parts = book.workKey.split('-');
        if (parts.length >= 2) {
          courseIds.add(parts[0]);
        }
      }
    }

    return Array.from(courseIds).slice(0, 20);
  }
}
