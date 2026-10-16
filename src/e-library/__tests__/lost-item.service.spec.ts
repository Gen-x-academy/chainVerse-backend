import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LostItemService } from '../services/lost-item.service';
import {
  LostItem,
  LostItemDocument,
  LostItemStatus,
} from '../schemas/lost-item.schema';
import {
  BookCopy,
  BookCopyDocument,
  CopyPhysicalStatus,
} from '../schemas/book-copy.schema';
import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../schemas/loan.schema';
import { Hold, HoldDocument } from '../schemas/hold.schema';
import { LedgerService } from '../services/ledger.service';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { DeclareLostItemDto, ProcessLostItemReturnDto } from '../dto/lost-item.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';

describe('LostItemService', () => {
  let service: LostItemService;
  let lostItemModel: jest.Mocked<Model<LostItemDocument>>;
  let copyModel: jest.Mocked<Model<BookCopyDocument>>;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let ledgerService: jest.Mocked<LedgerService>;

  const PATRON_ID = 'patron-abc';
  const LOAN_ID = '507f1f77bcf86cd799439011';
  const COPY_ID = '507f1f77bcf86cd799439012';
  const BOOK_ID = '507f1f77bcf86cd799439013';
  const STAFF_ID = 'staff-001';

  const mockLoan = {
    _id: LOAN_ID,
    patronId: PATRON_ID,
    bookId: BOOK_ID,
    status: LoanStatus.OVERDUE,
    copyStatus: CopyStatus.NORMAL,
  };

  const mockCopy = {
    _id: COPY_ID,
    bookId: BOOK_ID,
    status: CopyPhysicalStatus.CHECKED_OUT,
    barcode: 'BC-001',
  };

  const mockLostItem = {
    _id: '507f1f77bcf86cd799439099',
    patronId: PATRON_ID,
    copyId: COPY_ID,
    loanId: LOAN_ID,
    status: LostItemStatus.DECLARED,
    processingFeeMinorUnits: 1000,
    replacementCostMinorUnits: 2500,
    currency: 'USD',
    processingFeeEntryId: '507f1f77bcf86cd799439021',
    replacementCostEntryId: '507f1f77bcf86cd799439022',
    reversalEntryId: null,
    declaredBy: STAFF_ID,
    declarationNote: 'Not returned after 60-day threshold',
    returnedAt: null,
    returnProcessedBy: null,
  };

  const dto: DeclareLostItemDto = {
    loanId: LOAN_ID,
    processingFeeMinorUnits: 1000,
    replacementCostMinorUnits: 2500,
    currency: 'USD',
    declarationNote: 'Not returned after 60-day threshold',
  };

  beforeEach(async () => {
    lostItemModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
        }),
      }),
      create: jest.fn().mockResolvedValue(mockLostItem),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn() }),
    } as any;

    copyModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockCopy) }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    } as any;

    loanModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockLoan) }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    } as any;

    holdModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as any;

    ledgerService = {
      postEntry: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          _id: '507f1f77bcf86cd799439021',
          ...input,
          toString: () => '507f1f77bcf86cd799439021',
        }),
      ),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LostItemService,
        { provide: getModelToken(LostItem.name), useValue: lostItemModel },
        { provide: getModelToken(BookCopy.name), useValue: copyModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: LedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<LostItemService>(LostItemService);
  });

  describe('declareLost', () => {
    it('should declare a copy lost and post both ledger entries', async () => {
      const result = await service.declareLost(dto, STAFF_ID);

      expect(loanModel.findByIdAndUpdate).toHaveBeenCalledWith(
        LOAN_ID,
        expect.objectContaining({ $set: { copyStatus: CopyStatus.LOST } }),
      );

      expect(copyModel.findByIdAndUpdate).toHaveBeenCalledWith(
        COPY_ID,
        expect.objectContaining({
          $set: { status: CopyPhysicalStatus.LOST },
        }),
      );

      expect(ledgerService.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: LedgerEntryType.LOST_ITEM_FEE,
          amountMinorUnits: 1000,
          currency: 'USD',
        }),
      );

      expect(ledgerService.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: LedgerEntryType.REPLACEMENT_COST_FEE,
          amountMinorUnits: 2500,
          currency: 'USD',
        }),
      );

      expect(result.status).toBe(LostItemStatus.DECLARED);
    });

    it('should cancel active holds on the copy', async () => {
      await service.declareLost(dto, STAFF_ID);

      expect(holdModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ copyId: COPY_ID, status: 'active' }),
        expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled' }) }),
      );
    });

    it('should reject if loan does not exist', async () => {
      loanModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.declareLost(dto, STAFF_ID)).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
    });

    it('should reject if loan is already RETURNED', async () => {
      loanModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...mockLoan, status: LoanStatus.RETURNED }),
      });

      await expect(service.declareLost(dto, STAFF_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });

    it('should reject duplicate declaration for the same loan', async () => {
      lostItemModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockLostItem),
      });

      await expect(service.declareLost(dto, STAFF_ID)).rejects.toBeInstanceOf(
        ResourceConflictException,
      );
    });
  });

  describe('processReturn', () => {
    const returnDto: ProcessLostItemReturnDto = { note: 'Copy returned' };

    beforeEach(() => {
      lostItemModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockLostItem),
      });
      lostItemModel.findByIdAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockLostItem,
          status: LostItemStatus.RETURNED,
          returnedAt: new Date(),
          reversalEntryId: '507f1f77bcf86cd799439033',
        }),
      });
    });

    it('should post a REPLACEMENT_COST_REVERSAL and restore copy to AVAILABLE', async () => {
      const result = await service.processReturn(
        '507f1f77bcf86cd799439099',
        returnDto,
        STAFF_ID,
      );

      expect(ledgerService.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: LedgerEntryType.REPLACEMENT_COST_REVERSAL,
          amountMinorUnits: -2500,
          referenceEntryId: '507f1f77bcf86cd799439022',
        }),
      );

      expect(copyModel.findByIdAndUpdate).toHaveBeenCalledWith(
        COPY_ID,
        expect.objectContaining({
          $set: { status: CopyPhysicalStatus.AVAILABLE },
        }),
      );

      expect(result.status).toBe(LostItemStatus.RETURNED);
    });

    it('should reject if lost item is not found', async () => {
      lostItemModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.processReturn('nonexistent', returnDto, STAFF_ID),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('should reject if lost item is not in DECLARED status', async () => {
      lostItemModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockLostItem,
          status: LostItemStatus.RETURNED,
        }),
      });

      await expect(
        service.processReturn('507f1f77bcf86cd799439099', returnDto, STAFF_ID),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });
  });

  describe('listForPatron', () => {
    it('should return lost-item records for a patron', async () => {
      const mockSort = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockLostItem]),
        }),
      });
      lostItemModel.find = jest.fn().mockReturnValue({ sort: mockSort });

      const result = await service.listForPatron(PATRON_ID);

      expect(lostItemModel.find).toHaveBeenCalledWith({ patronId: PATRON_ID });
      expect(result).toEqual([mockLostItem]);
    });

    it('should filter by status when provided', async () => {
      const mockSort = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockLostItem]),
        }),
      });
      lostItemModel.find = jest.fn().mockReturnValue({ sort: mockSort });

      await service.listForPatron(PATRON_ID, LostItemStatus.DECLARED);

      expect(lostItemModel.find).toHaveBeenCalledWith({
        patronId: PATRON_ID,
        status: LostItemStatus.DECLARED,
      });
    });
  });
});
