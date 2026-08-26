import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { LibraryPolicy, LibraryPolicyDocument, GLOBAL_LIBRARY_POLICY_SCOPE } from '../schemas/library-policy.schema';
import { PatronProfile, PatronProfileDocument, PatronStatus } from '../schemas/patron-profile.schema';
import { BarcodeService } from './barcode.service';
import { BorrowingPolicyService, PolicyResolution } from './borrowing-policy.service';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { addDays } from '../e-library.util';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';

@Injectable()
export class PhysicalCheckoutService {
  constructor(
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
    @InjectModel(LibraryPolicy.name)
    private readonly policyModel: Model<LibraryPolicyDocument>,
    @InjectModel(PatronProfile.name)
    private readonly patronModel: Model<PatronProfileDocument>,
    private readonly barcodeService: BarcodeService,
    private readonly policyService: BorrowingPolicyService,
    private readonly transactionRunner: LibraryTransactionRunner,
  ) {}

  async checkout(barcode: string, patronId: string, staffId?: string): Promise<Loan> {
    const copy = await this.barcodeService.findByBarcode(barcode);

    if (copy.status !== CopyPhysicalStatus.AVAILABLE) {
      throw new ResourceConflictException(
        `Copy is not available (current status: ${copy.status})`,
        ErrorCode.BIZ_ITEM_UNAVAILABLE,
      );
    }

    const patronCheck = await this.policyService.resolvePolicy(patronId);
    if (patronCheck.status !== PatronStatus.ACTIVE) {
      throw new ResourceConflictException(
        `Patron is not eligible for checkout (status: ${patronCheck.status})`,
        ErrorCode.BIZ_SUBSCRIPTION_INACTIVE,
      );
    }

    const activeLoansCount = await this.loanModel.countDocuments({
      patronId,
      status: LoanStatus.ACTIVE,
    });

    if (activeLoansCount >= patronCheck.maxActiveLoans) {
      throw new ResourceConflictException(
        `Active loan limit reached (${activeLoansCount}/${patronCheck.maxActiveLoans})`,
        ErrorCode.BIZ_RENEWAL_LIMIT_EXCEEDED,
      );
    }

    const policy = await this.policyModel.findOne({ scope: GLOBAL_LIBRARY_POLICY_SCOPE });
    const loanPeriodDays = policy?.loanPeriodDays ?? patronCheck.loanPeriodDays;

    return this.transactionRunner.run(async (session) => {
      const lockedCopy = await this.bookCopyModel.findOneAndUpdate(
        { _id: copy._id, status: CopyPhysicalStatus.AVAILABLE },
        { $set: { status: CopyPhysicalStatus.CHECKED_OUT, lastLoanAt: new Date() } },
        { new: true, session },
      );

      if (!lockedCopy) {
        throw new ResourceConflictException(
          'Copy was claimed by another request before checkout could complete',
          ErrorCode.BIZ_ITEM_UNAVAILABLE,
        );
      }

      const [loan] = await this.loanModel.create(
        [{
          patronId,
          bookId: lockedCopy.bookId,
          workKey: lockedCopy.bookId.toString(),
          checkedOutAt: new Date(),
          dueDate: addDays(new Date(), loanPeriodDays),
          status: LoanStatus.ACTIVE,
          copyStatus: 'normal' as any,
        }],
        { session },
      );

      return loan;
    });
  }
}
