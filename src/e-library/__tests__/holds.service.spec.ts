import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HoldsService } from '../holds.service';
import { Hold, HoldDocument, HoldStatus, ACTIVE_HOLD_STATUSES } from '../schemas/hold.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import { LibraryPolicyService } from '../library-policy.service';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  ResourceNotFoundException,
  ResourceConflictException,
} from '../../common/errors/domain.exception';

describe('HoldsService', () => {
  let service: HoldsService;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let policyService: jest.Mocked<LibraryPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  const mockPolicy = {
    maxActiveHolds: 5,
    holdExpiryDays: 14,
    allowMultipleEditionsPerWork: false,
  };

  const mockHold = {
    _id: '507f1f77bcf86cd799439011',
    patronId: 'patron-1',
    bookId: '507f1f77bcf86cd799439022',
    workKey: 'work-1',
    status: HoldStatus.PENDING,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 86400000),
  };

  beforeEach(async () => {
    holdModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
    } as any;

    bookModel = {
      findById: jest.fn(),
      exists: jest.fn(),
    } as any;

    loanModel = {
      find: jest.fn(),
      countDocuments: jest.fn(),
    } as any;

    policyService = {
      getPolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldsService,
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: LibraryPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
        { provide: PaginationService, useValue: { paginate: jest.fn() } },
      ],
    }).compile();

    service = module.get<HoldsService>(HoldsService);
  });

  describe('createHold', () => {
    it('should create a hold when policy allows', async () => {
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.findById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439022',
        workKey: 'work-1',
        availableCopies: 3,
      } as any);
      holdModel.countDocuments.mockResolvedValue(0);
      holdModel.create.mockResolvedValue(mockHold as any);

      const result = await service.createHold('patron-1', {
        bookId: '507f1f77bcf86cd799439022',
      } as any);

      expect(result).toEqual(mockHold);
    });

    it('should throw ResourceNotFoundException when book not found', async () => {
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.findById.mockResolvedValue(null);

      await expect(
        service.createHold('patron-1', {
          bookId: '507f1f77bcf86cd799439099',
        } as any),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    it('should throw ResourceConflictException when max holds reached', async () => {
      policyService.getPolicy.mockResolvedValue(mockPolicy as any);
      bookModel.findById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439022',
        workKey: 'work-1',
      } as any);
      holdModel.countDocuments.mockResolvedValue(5); // at max

      await expect(
        service.createHold('patron-1', {
          bookId: '507f1f77bcf86cd799439022',
        } as any),
      ).rejects.toThrow(ResourceConflictException);
    });
  });

  describe('cancelHold', () => {
    it('should cancel an active hold', async () => {
      holdModel.findOneAndUpdate.mockResolvedValue({
        ...mockHold,
        status: HoldStatus.CANCELLED,
      } as any);

      const result = await service.cancelHold(
        'hold-1',
        'patron-1',
      );

      expect(holdModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });
});
