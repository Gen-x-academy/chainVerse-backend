import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DigitalLoan, DigitalLoanDocument, DigitalLoanStatus } from '../schemas/digital-loan.schema';
import { PatronProfile, PatronProfileDocument, PatronStatus } from '../schemas/patron-profile.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { BorrowingPolicyService } from './borrowing-policy.service';
import { addDays } from '../e-library.util';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';
import * as crypto from 'crypto';

@Injectable()
export class DigitalCheckoutService {
  constructor(
    @InjectModel(DigitalLoan.name)
    private readonly digitalLoanModel: Model<DigitalLoanDocument>,
    @InjectModel(PatronProfile.name)
    private readonly patronModel: Model<PatronProfileDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    private readonly policyService: BorrowingPolicyService,
    private readonly transactionRunner: LibraryTransactionRunner,
  ) {}

  async checkout(patronId: string, bookId: string, editionId: string, format?: string): Promise<DigitalLoan> {
    const patronCheck = await this.policyService.resolvePolicy(patronId);
    if (patronCheck.status !== PatronStatus.ACTIVE) {
      throw new ResourceConflictException(
        `Patron is not eligible for digital checkout (status: ${patronCheck.status})`,
        ErrorCode.BIZ_SUBSCRIPTION_INACTIVE,
      );
    }

    // Idempotent: if an active digital loan exists for this patron+edition, return it
    const existing = await this.digitalLoanModel.findOne({
      patronId,
      editionId,
      status: DigitalLoanStatus.ACTIVE,
    }).exec();
    if (existing) {
      return existing;
    }

    // Check license availability
    const availableLicense = await this.bookCopyModel.findOne({
      bookId,
      status: CopyPhysicalStatus.AVAILABLE,
    }).exec();

    if (!availableLicense) {
      throw new ResourceConflictException(
        'No digital licenses available for this edition',
        ErrorCode.BIZ_ITEM_UNAVAILABLE,
      );
    }

    return this.transactionRunner.run(async (session) => {
      const claimedLicense = await this.bookCopyModel.findOneAndUpdate(
        { _id: availableLicense._id, status: CopyPhysicalStatus.AVAILABLE },
        { $set: { status: CopyPhysicalStatus.CHECKED_OUT } },
        { new: true, session },
      );

      if (!claimedLicense) {
        throw new ResourceConflictException(
          'License was claimed by another request',
          ErrorCode.BIZ_ITEM_UNAVAILABLE,
        );
      }

      const loanPeriodDays = patronCheck.loanPeriodDays;
      const accessToken = crypto.randomBytes(32).toString('hex');

      const [digitalLoan] = await this.digitalLoanModel.create(
        [{
          patronId,
          bookId,
          editionId,
          format: format ?? 'epub',
          checkedOutAt: new Date(),
          expiresAt: addDays(new Date(), loanPeriodDays),
          status: DigitalLoanStatus.ACTIVE,
          accessToken,
        }],
        { session },
      );

      return digitalLoan;
    });
  }
}
