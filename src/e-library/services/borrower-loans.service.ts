import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import { DigitalLoan, DigitalLoanDocument, DigitalLoanStatus } from '../schemas/digital-loan.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { BookCopy, BookCopyDocument } from '../schemas/book-copy.schema';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

export interface CurrentLoanView {
  loanId: string;
  bookId: string;
  bookTitle?: string;
  format: 'physical' | 'digital';
  checkedOutAt: Date;
  dueDate: Date;
  renewalCount: number;
  maxRenewals: number;
  renewalEligible: boolean;
  holdPressure: boolean;
  status: string;
  copyBarcode?: string;
}

@Injectable()
export class BorrowerLoansService {
  constructor(
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(DigitalLoan.name)
    private readonly digitalLoanModel: Model<DigitalLoanDocument>,
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async getCurrentLoans(patronId: string, paginationDto: PaginationDto) {
    const filter = { patronId, status: LoanStatus.ACTIVE };
    return this.paginationService.paginate(this.loanModel, paginationDto, filter);
  }

  async getCurrentLoansWithDetails(patronId: string, paginationDto: PaginationDto) {
    const result = await this.paginationService.paginate(this.loanModel, paginationDto, {
      patronId,
      status: LoanStatus.ACTIVE,
    });

    const enriched = await Promise.all(
      result.data.map(async (loan: LoanDocument) => {
        const book = await this.bookModel.findById(loan.bookId);
        const copy = await this.bookCopyModel.findOne({ bookId: loan.bookId });
        const holdCount = await this.loanModel.countDocuments({
          bookId: loan.bookId,
          status: LoanStatus.ACTIVE,
        });

        return {
          loanId: loan.id,
          bookId: loan.bookId,
          bookTitle: book?.title ?? 'Unknown',
          format: copy ? 'physical' : 'digital',
          checkedOutAt: loan.checkedOutAt,
          dueDate: loan.dueDate,
          renewalCount: loan.renewalCount,
          maxRenewals: 2,
          renewalEligible: loan.renewalCount < 2 && loan.dueDate > new Date(),
          holdPressure: holdCount > 1,
          status: loan.status,
          copyBarcode: copy?.barcode,
        } satisfies CurrentLoanView;
      }),
    );

    return { ...result, data: enriched };
  }

  async getLoanHistory(patronId: string, paginationDto: PaginationDto, filters?: { startDate?: string; endDate?: string }) {
    const filter: Record<string, unknown> = { patronId, status: LoanStatus.RETURNED };

    if (filters?.startDate || filters?.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.$lte = new Date(filters.endDate);
      filter.checkedOutAt = dateFilter;
    }

    return this.paginationService.paginate(this.loanModel, paginationDto, filter);
  }
}
