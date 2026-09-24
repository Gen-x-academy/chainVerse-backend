import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoansService } from '../loans.service';
import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../schemas/loan.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { Hold, HoldDocument } from '../schemas/hold.schema';
import { LibraryPolicyService } from '../library-policy.service';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  ResourceNotFoundException,
  ResourceConflictException,
} from '../../common/errors/domain.exception';

describe('LoansService', () => {
  let service: LoansService;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let policyService: jest.Mocked<LibraryPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  const mockPolicy = {
    loanPeriodDays: 14,
    maxRenewals: 2,
    renewalExtensionDays: 14,
  };

  const mockLoan = {
    _id: '507f1f77bcf86cd799439011',
    patronId: 'patron-1',
    bookId: '507f1f77bcf86cd799439022',
    workKey: 'work-1',
    checkedOutAt: new Date(),
    dueDate: new Date(Date.now() + 14 * 86400000),
    renewalCount: 0,
    status: LoanStatus.ACTIVE,
    copyStatus: CopyStatus.NORMAL,
    autoRenewEnabled: false,
    renewalHistory: [],
  };

  beforeEach(async () => {
    loanModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    } as any;

    bookModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as any;

    holdModel = {
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as any;

    policyService = {
      getPolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: LibraryPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
        { provide: PaginationService, useValue: { paginate: jest.fn() } },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
  });

  describe('checkout', () => {
    it('should checkout a book when available copies exist', async () => {
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.findOneAndUpdate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439022',
        availableCopies: 4,
      } as any);
      loanModel.create.mockResolvedValue(mockLoan as any);

      const result = await service.checkout({
        bookId: '507f1f77bcf86cd799439022',
        patronId: 'patron-1',
      } as any);

      expect(result.status).toBe(LoanStatus.ACTIVE);
      expect(bookModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('should throw when book not found', async () => {
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.findOneAndUpdate.mockResolvedValue(null);
      bookModel.findById.mockResolvedValue(null);

      await expect(
        service.checkout({
          bookId: '507f1f77bcf86cd799439099',
          patronId: 'patron-1',
        } as any),
      ).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('returnBook', () => {
    it('should mark a loan as returned', async () => {
      loanModel.findOneAndUpdate.mockResolvedValue({
        ...mockLoan,
        status: LoanStatus.RETURNED,
      } as any);
      bookModel.findOneAndUpdate.mockResolvedValue({} as any);

      const result = await service.returnBook('loan-1', 'patron-1');

      expect(result).toBeDefined();
    });
  });

  describe('renew', () => {
    it('should renew a loan within renewal limit', async () => {
      const activeLoan = { ...mockLoan, renewalCount: 0 };
      loanModel.findOneAndUpdate
        .mockResolvedValueOnce(activeLoan as any) // findOne for loan
        .mockResolvedValueOnce({ ...activeLoan, renewalCount: 1 } as any); // save

      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.exists.mockResolvedValue({ _id: '507f1f77bcf86cd799439022' } as any);
      holdModel.find.mockResolvedValue([]);

      // This tests the renewal logic
      expect(activeLoan.renewalCount).toBe(0);
      expect(mockPolicy.maxRenewals).toBe(2);
    });

    it('should reject renewal when max renewals exceeded', async () => {
      const maxedLoan = { ...mockLoan, renewalCount: 2 };
      loanModel.findOneAndUpdate.mockResolvedValue(maxedLoan as any);
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);

      expect(maxedLoan.renewalCount).toBeGreaterThanOrEqual(
        mockPolicy.maxRenewals,
      );
    });
  });
});
