import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  assertOwner,
  assertOwnerOrStaff,
  RequestActor,
} from '../common/auth/resource-owner';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { Book, BookDocument } from './schemas/book.schema';
import { Loan, LoanDocument, LoanStatus } from './schemas/loan.schema';
import {
  ACTIVE_HOLD_STATUSES,
  Hold,
  HoldDocument,
  HoldStatus,
} from './schemas/hold.schema';
import { CreateHoldDto } from './dto/create-hold.dto';
import { LibraryPolicyService } from './library-policy.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';
import { addDays, isDuplicateKeyError } from './e-library.util';

export interface HoldStatusView {
  holdId: string;
  bookId: string;
  status: HoldStatus;
  queuePosition: number;
  estimatedWaitDays: number;
}

@Injectable()
export class HoldsService {
  constructor(
    @InjectModel(Hold.name) private readonly holdModel: Model<HoldDocument>,
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    private readonly policyService: LibraryPolicyService,
    private readonly transactionRunner: LibraryTransactionRunner,
    private readonly paginationService: PaginationService,
  ) {}

  async createHold(
    patronId: string,
    dto: CreateHoldDto,
  ): Promise<HoldDocument> {
    const policy = await this.policyService.getPolicy();

    return this.transactionRunner.run(async (session) => {
      const book = await this.bookModel.findById(dto.bookId).session(session);
      if (!book) {
        throw new ResourceNotFoundException(
          'Book not found',
          ErrorCode.RES_BOOK_NOT_FOUND,
        );
      }

      const activeHoldsCount = await this.holdModel
        .countDocuments({ patronId, status: { $in: ACTIVE_HOLD_STATUSES } })
        .session(session);
      if (activeHoldsCount >= policy.maxActiveHolds) {
        throw new ResourceConflictException(
          `Active hold limit reached (${activeHoldsCount}/${policy.maxActiveHolds})`,
          ErrorCode.BIZ_HOLD_LIMIT_REACHED,
        );
      }

      if (!policy.allowMultipleEditionsPerWork) {
        const [existingHold, existingLoan] = await Promise.all([
          this.holdModel
            .findOne({
              patronId,
              workKey: book.workKey,
              status: { $in: ACTIVE_HOLD_STATUSES },
            })
            .session(session),
          this.loanModel
            .findOne({
              patronId,
              workKey: book.workKey,
              status: LoanStatus.ACTIVE,
            })
            .session(session),
        ]);
        if (existingHold || existingLoan) {
          throw new ResourceConflictException(
            'You already hold or have borrowed another edition of this work',
            ErrorCode.BIZ_DUPLICATE_EDITION_HOLD,
          );
        }
      }

      try {
        const [hold] = await this.holdModel.create(
          [
            {
              patronId,
              bookId: book._id,
              workKey: book.workKey,
              status: HoldStatus.PENDING,
              requestedAt: new Date(),
              expiresAt: addDays(new Date(), policy.holdExpiryDays),
            },
          ],
          { session },
        );
        return hold;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ResourceConflictException(
            'You already have an active hold on this exact edition',
            ErrorCode.BIZ_HOLD_ALREADY_EXISTS,
          );
        }
        throw error;
      }
    });
  }

  async cancelHold(holdId: string, actor: RequestActor): Promise<HoldDocument> {
    const hold = await this.holdModel.findById(holdId);
    if (!hold) {
      throw new ResourceNotFoundException(
        'Hold not found',
        ErrorCode.RES_HOLD_NOT_FOUND,
      );
    }
    assertOwner(hold.patronId, actor, 'hold');

    if (!ACTIVE_HOLD_STATUSES.includes(hold.status)) {
      throw new ResourceConflictException(
        'Hold is no longer active and cannot be cancelled',
      );
    }

    hold.status = HoldStatus.CANCELLED;
    await hold.save();
    return hold;
  }

  async listMyHolds(patronId: string, paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.holdModel, paginationDto, {
      patronId,
    });
  }

  async getHoldStatus(
    holdId: string,
    actor: RequestActor,
  ): Promise<HoldStatusView> {
    const hold = await this.holdModel.findById(holdId);
    if (!hold) {
      throw new ResourceNotFoundException(
        'Hold not found',
        ErrorCode.RES_HOLD_NOT_FOUND,
      );
    }
    assertOwnerOrStaff(hold.patronId, actor, 'hold');

    const [book, policy, aheadCount] = await Promise.all([
      this.bookModel.findById(hold.bookId),
      this.policyService.getPolicy(),
      this.holdModel.countDocuments({
        bookId: hold.bookId,
        status: HoldStatus.PENDING,
        requestedAt: { $lt: hold.requestedAt },
      }),
    ]);

    const isWaiting = hold.status === HoldStatus.PENDING;
    const queuePosition = isWaiting ? aheadCount + 1 : 0;
    const copies = Math.max(book?.totalCopies ?? 1, 1);
    const estimatedWaitDays = isWaiting
      ? Math.ceil(queuePosition / copies) * policy.loanPeriodDays
      : 0;

    return {
      holdId: hold.id,
      bookId: hold.bookId.toString(),
      status: hold.status,
      queuePosition,
      estimatedWaitDays,
    };
  }
}
