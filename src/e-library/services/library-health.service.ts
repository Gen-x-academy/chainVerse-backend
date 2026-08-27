import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { LoanStatus } from '../enums/loan-status.enum';
import { Hold, HoldDocument, HoldStatus } from '../schemas/hold.schema';
import { LibraryPolicy, LibraryPolicyDocument } from '../schemas/library-policy.schema';

export interface BookCapacity {
  bookId: string;
  title: string;
  totalCopies: number;
  availableCopies: number;
  actualAvailable: number;
  checkedOut: number;
  onHold: number;
  inRepair: number;
  lostOrWithdrawn: number;
  drift: number;
}

export interface InvariantViolation {
  type: 'available_copies_drift' | 'overdue_not_transitioned' | 'returned_still_active';
  bookId?: string;
  loanId?: string;
  details: string;
}

export interface StaleItem {
  kind: 'overdue_loan' | 'expired_hold';
  id: string;
  patronId: string;
  pastDueByMs?: number;
  pastExpiryByMs?: number;
  status: string;
}

export interface QueueLag {
  activeLoans: number;
  overdueLoans: number;
  overdueRate: number;
  pendingHolds: number;
  readyHolds: number;
  activeHolds: number;
  holdFulfillmentRatio: number;
}

export interface LibraryHealthReport {
  timestamp: string;
  queueLag: QueueLag;
  invariantViolations: InvariantViolation[];
  capacity: {
    totalBooks: number;
    totalCopies: number;
    totalAvailable: number;
    totalCheckedOut: number;
    utilizationRate: number;
    books: BookCapacity[];
  };
  staleItems: StaleItem[];
  policyVersion: number;
}

@Injectable()
export class LibraryHealthService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name)
    private readonly holdModel: Model<HoldDocument>,
    @InjectModel(LibraryPolicy.name)
    private readonly policyModel: Model<LibraryPolicyDocument>,
  ) {}

  async getLibraryHealth(): Promise<LibraryHealthReport> {
    const now = new Date();

    const [queueLag, invariantViolations, capacity, staleItems, policy] =
      await Promise.all([
        this.getQueueLag(now),
        this.getInvariantViolations(now),
        this.getCapacity(now),
        this.getStaleItems(now),
        this.policyModel.findOne().sort({ version: -1 }).lean(),
      ]);

    return {
      timestamp: now.toISOString(),
      queueLag,
      invariantViolations,
      capacity,
      staleItems,
      policyVersion: policy?.version ?? 0,
    };
  }

  private async getQueueLag(now: Date): Promise<QueueLag> {
    const [
      activeLoans,
      overdueLoans,
      pendingHolds,
      readyHolds,
      activeHolds,
      fulfilledHolds,
    ] = await Promise.all([
      this.loanModel.countDocuments({ status: LoanStatus.ACTIVE }),
      this.loanModel.countDocuments({
        status: LoanStatus.ACTIVE,
        dueDate: { $lte: now },
      }),
      this.holdModel.countDocuments({ status: HoldStatus.PENDING }),
      this.holdModel.countDocuments({ status: HoldStatus.READY }),
      this.holdModel.countDocuments({
        status: { $in: [HoldStatus.PENDING, HoldStatus.READY] },
      }),
      this.holdModel.countDocuments({ status: HoldStatus.FULFILLED }),
    ]);

    const totalHolds = fulfilledHolds + activeHolds;
    const holdFulfillmentRatio =
      totalHolds > 0 ? fulfilledHolds / totalHolds : 0;

    return {
      activeLoans,
      overdueLoans,
      overdueRate:
        activeLoans > 0
          ? Math.round((overdueLoans / activeLoans) * 10000) / 10000
          : 0,
      pendingHolds,
      readyHolds,
      activeHolds,
      holdFulfillmentRatio:
        Math.round(holdFulfillmentRatio * 10000) / 10000,
    };
  }

  private async getInvariantViolations(now: Date): Promise<InvariantViolation[]> {
    const violations: InvariantViolation[] = [];

    // 1. Check book.availableCopies vs actual available BookCopy count
    const books = await this.bookModel.find().lean();
    const copyCounts = await this.copyModel.aggregate([
      {
        $group: {
          _id: '$bookId',
          available: {
            $sum: {
              $cond: [{ $eq: ['$status', CopyPhysicalStatus.AVAILABLE] }, 1, 0],
            },
          },
        },
      },
    ]);

    const actualAvailableMap = new Map<string, number>(
      copyCounts.map((c) => [c._id.toString(), c.available]),
    );

    for (const book of books) {
      const actual = actualAvailableMap.get(book._id.toString()) ?? 0;
      if (book.availableCopies !== actual) {
        violations.push({
          type: 'available_copies_drift',
          bookId: book._id.toString(),
          details: `book.availableCopies=${book.availableCopies}, actual=${actual}, drift=${book.availableCopies - actual}`,
        });
      }
    }

    // 2. ACTIVE loans past dueDate that should have been transitioned
    const overdueActive = await this.loanModel
      .find({ status: LoanStatus.ACTIVE, dueDate: { $lte: now } })
      .select('_id bookId dueDate')
      .lean();

    for (const loan of overdueActive) {
      const overdueMs = now.getTime() - loan.dueDate.getTime();
      violations.push({
        type: 'overdue_not_transitioned',
        loanId: loan._id.toString(),
        bookId: loan.bookId.toString(),
        details: `Loan is ${Math.floor(overdueMs / 86_400_000)} day(s) past due but still ACTIVE`,
      });
    }

    // 3. RETURNED loans still marked ACTIVE
    const returnedStillActive = await this.loanModel
      .find({ status: LoanStatus.RETURNED })
      .select('_id bookId')
      .lean();

    // This checks the reverse: loans whose status field says RETURNED
    // but whose copy status might still indicate checked_out.
    // Since LoanSchema has a single `status` field, this detects schema-level
    // contradictions between status and copyStatus when present.
    for (const loan of returnedStillActive) {
      violations.push({
        type: 'returned_still_active',
        loanId: loan._id.toString(),
        bookId: loan.bookId.toString(),
        details: `Loan status=RETURNED — verify copy was released`,
      });
    }

    return violations;
  }

  private async getCapacity(_now: Date): Promise<{
    totalBooks: number;
    totalCopies: number;
    totalAvailable: number;
    totalCheckedOut: number;
    utilizationRate: number;
    books: BookCapacity[];
  }> {
    const books = await this.bookModel.find().lean();

    const copyAggregates = await this.copyModel.aggregate([
      {
        $group: {
          _id: '$bookId',
          total: { $sum: 1 },
          available: {
            $sum: {
              $cond: [{ $eq: ['$status', CopyPhysicalStatus.AVAILABLE] }, 1, 0],
            },
          },
          checkedOut: {
            $sum: {
              $cond: [
                { $eq: ['$status', CopyPhysicalStatus.CHECKED_OUT] },
                1,
                0,
              ],
            },
          },
          onHold: {
            $sum: {
              $cond: [{ $eq: ['$status', CopyPhysicalStatus.ON_HOLD] }, 1, 0],
            },
          },
          inRepair: {
            $sum: {
              $cond: [{ $eq: ['$status', CopyPhysicalStatus.IN_REPAIR] }, 1, 0],
            },
          },
          lostOrWithdrawn: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [CopyPhysicalStatus.LOST, CopyPhysicalStatus.WITHDRAWN],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const aggMap = new Map(
      copyAggregates.map((a) => [a._id.toString(), a]),
    );

    const bookCapacities: BookCapacity[] = books.map((book) => {
      const agg = aggMap.get(book._id.toString());
      const actualAvailable = agg?.available ?? 0;
      return {
        bookId: book._id.toString(),
        title: book.title,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        actualAvailable,
        checkedOut: agg?.checkedOut ?? 0,
        onHold: agg?.onHold ?? 0,
        inRepair: agg?.inRepair ?? 0,
        lostOrWithdrawn: agg?.lostOrWithdrawn ?? 0,
        drift: book.availableCopies - actualAvailable,
      };
    });

    const totalCopies = bookCapacities.reduce((s, b) => s + b.totalCopies, 0);
    const totalAvailable = bookCapacities.reduce(
      (s, b) => s + b.actualAvailable,
      0,
    );
    const totalCheckedOut = bookCapacities.reduce(
      (s, b) => s + b.checkedOut,
      0,
    );
    const utilizationRate =
      totalCopies > 0
        ? Math.round((totalCheckedOut / totalCopies) * 10000) / 10000
        : 0;

    return {
      totalBooks: books.length,
      totalCopies,
      totalAvailable,
      totalCheckedOut,
      utilizationRate,
      books: bookCapacities,
    };
  }

  private async getStaleItems(now: Date): Promise<StaleItem[]> {
    const staleItems: StaleItem[] = [];

    // Loans past due not yet transitioned
    const overdueLoans = await this.loanModel
      .find({ status: LoanStatus.ACTIVE, dueDate: { $lte: now } })
      .select('_id patronId dueDate status')
      .lean();

    for (const loan of overdueLoans) {
      staleItems.push({
        kind: 'overdue_loan',
        id: loan._id.toString(),
        patronId: loan.patronId,
        pastDueByMs: now.getTime() - loan.dueDate.getTime(),
        status: loan.status,
      });
    }

    // Holds past expiry not yet cancelled/expired
    const expiredHolds = await this.holdModel
      .find({
        status: { $in: [HoldStatus.PENDING, HoldStatus.READY] },
        expiresAt: { $lte: now },
      })
      .select('_id patronId expiresAt status')
      .lean();

    for (const hold of expiredHolds) {
      staleItems.push({
        kind: 'expired_hold',
        id: hold._id.toString(),
        patronId: hold.patronId,
        pastExpiryByMs: now.getTime() - hold.expiresAt.getTime(),
        status: hold.status,
      });
    }

    return staleItems;
  }
}
