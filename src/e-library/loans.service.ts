import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { assertOwner, RequestActor } from '../common/auth/resource-owner';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { Book, BookDocument } from './schemas/book.schema';
import {
  ACTIVE_HOLD_STATUSES,
  Hold,
  HoldDocument,
} from './schemas/hold.schema';
import {
  CopyStatus,
  Loan,
  LoanDocument,
  LoanStatus,
  RenewalMethod,
} from './schemas/loan.schema';
import { LibraryPolicyDocument } from './schemas/library-policy.schema';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ToggleAutoRenewDto } from './dto/toggle-auto-renew.dto';
import { LibraryPolicyService } from './library-policy.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';
import { addDays } from './e-library.util';

@Injectable()
export class LoansService {
  constructor(
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(Hold.name) private readonly holdModel: Model<HoldDocument>,
    private readonly policyService: LibraryPolicyService,
    private readonly transactionRunner: LibraryTransactionRunner,
    private readonly paginationService: PaginationService,
  ) {}

  /** Minimal staff-initiated checkout — the supporting op renewals act on. */
  async checkout(dto: CreateLoanDto): Promise<LoanDocument> {
    const policy = await this.policyService.getPolicy();

    return this.transactionRunner.run(async (session) => {
      const book = await this.bookModel.findOneAndUpdate(
        { _id: dto.bookId, availableCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } },
        { new: true, session },
      );

      if (!book) {
        const exists = await this.bookModel
          .exists({ _id: dto.bookId })
          .session(session);
        if (!exists) {
          throw new ResourceNotFoundException(
            'Book not found',
            ErrorCode.RES_BOOK_NOT_FOUND,
          );
        }
        throw new ResourceConflictException(
          'No copies available to check out',
          ErrorCode.BIZ_NO_COPIES_AVAILABLE,
        );
      }

      const [loan] = await this.loanModel.create(
        [
          {
            patronId: dto.patronId,
            bookId: book._id,
            workKey: book.workKey,
            checkedOutAt: new Date(),
            dueDate: addDays(new Date(), policy.loanPeriodDays),
          },
        ],
        { session },
      );
      return loan;
    });
  }

  async listMyLoans(patronId: string, paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.loanModel, paginationDto, {
      patronId,
    });
  }

  async setAutoRenew(
    loanId: string,
    actor: RequestActor,
    dto: ToggleAutoRenewDto,
  ): Promise<LoanDocument> {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException(
        'Loan not found',
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }
    assertOwner(loan.patronId, actor, 'loan');

    loan.autoRenewEnabled = dto.autoRenewEnabled;
    await loan.save();
    return loan;
  }

  async renewLoan(loanId: string, actor: RequestActor): Promise<LoanDocument> {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException(
        'Loan not found',
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }
    assertOwner(loan.patronId, actor, 'loan');

    const policy = await this.policyService.getPolicy();
    return this.performRenewal(loan.id, policy, 'manual');
  }

  /** Used by the auto-renewal job — same eligibility rules, tagged `method: 'auto'`. */
  async renewForAutoJob(
    loan: LoanDocument,
    policy: LibraryPolicyDocument,
  ): Promise<LoanDocument> {
    return this.performRenewal(loan.id, policy, 'auto');
  }

  /**
   * Re-validates every renewal guard and applies the extension atomically:
   * the `findOneAndUpdate` filter repeats each guard condition so a
   * concurrent change (return, hold placed, limit hit) loses the update
   * instead of corrupting state.
   */
  private async performRenewal(
    loanId: string,
    policy: LibraryPolicyDocument,
    method: RenewalMethod,
  ): Promise<LoanDocument> {
    return this.transactionRunner.run(async (session) => {
      const now = new Date();
      const loan = await this.loanModel.findById(loanId).session(session);
      if (!loan) {
        throw new ResourceNotFoundException(
          'Loan not found',
          ErrorCode.RES_LOAN_NOT_FOUND,
        );
      }

      if (loan.status !== LoanStatus.ACTIVE) {
        throw new ResourceConflictException(
          'Loan is not active',
          ErrorCode.BIZ_LOAN_NOT_ACTIVE,
        );
      }
      if (loan.dueDate < now) {
        throw new ResourceConflictException(
          'Loan is overdue and must be returned before it can be renewed',
          ErrorCode.BIZ_LOAN_OVERDUE,
        );
      }
      if (loan.renewalCount >= policy.maxRenewals) {
        throw new ResourceConflictException(
          `Renewal limit reached (${loan.renewalCount}/${policy.maxRenewals})`,
          ErrorCode.BIZ_RENEWAL_LIMIT_REACHED,
        );
      }
      if (loan.copyStatus !== CopyStatus.NORMAL) {
        throw new ResourceConflictException(
          'This copy is flagged and cannot be renewed',
          ErrorCode.BIZ_COPY_NOT_RENEWABLE,
        );
      }

      const conflictingHold = await this.holdModel
        .findOne({
          bookId: loan.bookId,
          status: { $in: ACTIVE_HOLD_STATUSES },
          patronId: { $ne: loan.patronId },
        })
        .session(session);
      if (conflictingHold) {
        throw new ResourceConflictException(
          'Another patron has an active hold on this book',
          ErrorCode.BIZ_BOOK_HAS_HOLDS,
        );
      }

      const previousDueDate = loan.dueDate;
      const newDueDate = addDays(previousDueDate, policy.renewalExtensionDays);

      const updated = await this.loanModel.findOneAndUpdate(
        {
          _id: loan._id,
          status: LoanStatus.ACTIVE,
          dueDate: { $gte: now },
          renewalCount: { $lt: policy.maxRenewals },
          copyStatus: CopyStatus.NORMAL,
        },
        {
          $set: { dueDate: newDueDate },
          $inc: { renewalCount: 1 },
          $push: {
            renewalHistory: {
              previousDueDate,
              newDueDate,
              renewedAt: now,
              policyVersion: policy.version,
              method,
            },
          },
        },
        { new: true, session },
      );

      if (!updated) {
        throw new ResourceConflictException(
          'Loan state changed before the renewal could complete; please retry',
          ErrorCode.BIZ_LOAN_NOT_ACTIVE,
        );
      }

      return updated;
    });
  }
}
