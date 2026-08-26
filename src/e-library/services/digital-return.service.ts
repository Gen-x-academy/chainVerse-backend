import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DigitalLoan, DigitalLoanDocument, DigitalLoanStatus } from '../schemas/digital-loan.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { assertOwner } from '../../common/auth/resource-owner';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';

@Injectable()
export class DigitalReturnService {
  constructor(
    @InjectModel(DigitalLoan.name)
    private readonly digitalLoanModel: Model<DigitalLoanDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    private readonly transactionRunner: LibraryTransactionRunner,
  ) {}

  async returnDigitalLoan(loanId: string, patronId: string): Promise<DigitalLoan> {
    const loan = await this.digitalLoanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException(
        'Digital loan not found',
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }

    if (loan.patronId !== patronId) {
      throw new ResourceConflictException(
        'You can only return your own digital loans',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    if (loan.status !== DigitalLoanStatus.ACTIVE) {
      throw new ResourceConflictException(
        'Digital loan is already returned or expired',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    return this.transactionRunner.run(async (session) => {
      const now = new Date();

      const updatedLoan = await this.digitalLoanModel.findOneAndUpdate(
        { _id: loanId, status: DigitalLoanStatus.ACTIVE },
        {
          $set: {
            status: DigitalLoanStatus.RETURNED,
            returnedAt: now,
            accessRevoked: true,
          },
        },
        { new: true, session },
      );

      if (!updatedLoan) {
        throw new ResourceConflictException(
          'Loan was already returned',
          ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
        );
      }

      // Release the license back to available pool
      await this.bookCopyModel.findOneAndUpdate(
        { bookId: loan.bookId, status: CopyPhysicalStatus.CHECKED_OUT },
        { $set: { status: CopyPhysicalStatus.AVAILABLE } },
        { session },
      );

      return updatedLoan;
    });
  }
}
