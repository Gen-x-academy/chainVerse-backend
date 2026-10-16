import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../schemas/loan.schema';
import { BarcodeService } from './barcode.service';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ReturnDisposition } from '../dto/physical-return.dto';

@Injectable()
export class PhysicalReturnService {
  constructor(
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    private readonly barcodeService: BarcodeService,
    private readonly transactionRunner: LibraryTransactionRunner,
  ) {}

  async returnCopy(
    barcode: string,
    disposition: ReturnDisposition = ReturnDisposition.AVAILABLE,
    condition?: string,
    note?: string,
    staffId?: string,
  ): Promise<{ loan: Loan; copy: BookCopy }> {
    const copy = await this.barcodeService.findByBarcode(barcode);

    if (copy.status === CopyPhysicalStatus.AVAILABLE) {
      throw new ResourceConflictException(
        'Copy is already available — no active loan found',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    const loan = await this.loanModel.findOne({
      bookId: copy.bookId,
      status: LoanStatus.ACTIVE,
    }).sort({ checkedOutAt: -1 }).exec();

    if (!loan) {
      throw new ResourceNotFoundException(
        'No active loan found for this copy',
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }

    return this.transactionRunner.run(async (session) => {
      const now = new Date();
      const isOverdue = loan.dueDate < now;

      const updatedLoan = await this.loanModel.findOneAndUpdate(
        { _id: loan._id, status: LoanStatus.ACTIVE },
        {
          $set: {
            status: LoanStatus.RETURNED,
            copyStatus: condition ? this.mapConditionToCopyStatus(condition) : CopyStatus.NORMAL,
          },
        },
        { new: true, session },
      );

      if (!updatedLoan) {
        throw new ResourceConflictException(
          'Loan was already returned by another request',
          ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
        );
      }

      const newStatus = this.mapDispositionToCopyStatus(disposition);
      const updatedCopy = await this.bookCopyModel.findOneAndUpdate(
        { _id: copy._id },
        {
          $set: {
            status: newStatus,
            condition: (condition as any) ?? copy.condition,
          },
          $push: {
            conditionHistory: condition ? {
              condition,
              recordedAt: now,
              recordedBy: staffId ?? 'system',
              note: note ?? undefined,
            } : undefined,
          },
        },
        { new: true, session },
      );

      return { loan: updatedLoan, copy: updatedCopy as BookCopy };
    });
  }

  private mapDispositionToCopyStatus(disposition: ReturnDisposition): CopyPhysicalStatus {
    switch (disposition) {
      case ReturnDisposition.AVAILABLE:
        return CopyPhysicalStatus.AVAILABLE;
      case ReturnDisposition.IN_REPAIR:
        return CopyPhysicalStatus.IN_REPAIR;
      case ReturnDisposition.QUARANTINE:
        return CopyPhysicalStatus.IN_REPAIR;
      default:
        return CopyPhysicalStatus.AVAILABLE;
    }
  }

  private mapConditionToCopyStatus(condition: string): CopyStatus {
    switch (condition) {
      case 'damaged':
        return CopyStatus.DAMAGED;
      case 'lost':
        return CopyStatus.LOST;
      default:
        return CopyStatus.NORMAL;
    }
  }
}
