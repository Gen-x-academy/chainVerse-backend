import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LibraryCirculationService } from './library-circulation.service';
import { LibraryItem } from './schemas/library-item.schema';
import { Loan, LoanStatus } from './schemas/loan.schema';
import { Hold } from './schemas/hold.schema';
import { CirculationReceipt } from './schemas/circulation-receipt.schema';
import { DueDateOverride, DueDateOverrideStatus } from './schemas/due-date-override.schema';
import { PatronLookupAudit } from './schemas/patron-lookup-audit.schema';
import { Role } from '../common/enums/role.enum';
import {
  ResourceNotFoundException,
  BusinessRuleException,
  ForbiddenDomainException,
} from '../common/errors/domain.exception';

function leanChain(value: unknown) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function findManyChain(value: unknown[]) {
  const q: any = {};
  q.sort = jest.fn().mockReturnValue(q);
  q.skip = jest.fn().mockReturnValue(q);
  q.limit = jest.fn().mockReturnValue(q);
  q.populate = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockResolvedValue(value);
  return q;
}

describe('LibraryCirculationService', () => {
  let service: LibraryCirculationService;
  let itemModel: any;
  let loanModel: any;
  let holdModel: any;
  let receiptModel: any;
  let overrideModel: any;
  let lookupAuditModel: any;
  let eventEmitter: any;

  beforeEach(async () => {
    itemModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
      findById: jest.fn(),
    };
    loanModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    holdModel = { create: jest.fn(), exists: jest.fn() };
    receiptModel = { create: jest.fn(), findOne: jest.fn() };
    overrideModel = { create: jest.fn(), findById: jest.fn() };
    lookupAuditModel = { create: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryCirculationService,
        { provide: getModelToken(LibraryItem.name), useValue: itemModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: getModelToken(CirculationReceipt.name), useValue: receiptModel },
        { provide: getModelToken(DueDateOverride.name), useValue: overrideModel },
        { provide: getModelToken(PatronLookupAudit.name), useValue: lookupAuditModel },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(LibraryCirculationService);
  });

  describe('checkout', () => {
    it('throws not-found when the barcode does not exist', async () => {
      itemModel.findOneAndUpdate.mockResolvedValue(null);
      itemModel.exists.mockResolvedValue(false);

      await expect(
        service.checkout('student-1', Role.STUDENT, { barcode: 'missing' }),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('throws a business-rule error when no copies are available', async () => {
      itemModel.findOneAndUpdate.mockResolvedValue(null);
      itemModel.exists.mockResolvedValue(true);

      await expect(
        service.checkout('student-1', Role.STUDENT, { barcode: 'b-1' }),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('checks out to self for a student and creates a receipt', async () => {
      itemModel.findOneAndUpdate.mockResolvedValue({
        _id: 'item-1',
        title: 'Clean Code',
        author: 'Robert Martin',
        servicePoint: 'main',
        availableCopies: 1,
      });
      loanModel.create.mockResolvedValue({ _id: 'loan-1' });
      receiptModel.create.mockResolvedValue({
        transactionId: 'txn-1',
        type: 'checkout',
        itemTitle: 'Clean Code',
        itemAuthor: 'Robert Martin',
        dueAt: new Date(),
        policy: 'Standard 14-day loan, max 2 renewals',
        servicePoint: 'main',
        createdAt: new Date(),
      });

      const receipt = await service.checkout('student-1', Role.STUDENT, { barcode: 'b-1' });

      expect(loanModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ patronId: 'student-1', checkedOutByStaffId: null }),
      );
      expect(receipt.transactionId).toBe('txn-1');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('requires an explicit patronId for staff-assisted checkout', async () => {
      await expect(
        service.checkout('librarian-1', Role.LIBRARIAN, { barcode: 'b-1' }),
      ).rejects.toThrow();
      expect(itemModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('returnLoan', () => {
    it('throws not-found when the loan does not exist', async () => {
      loanModel.findById.mockResolvedValue(null);

      await expect(
        service.returnLoan('student-1', Role.STUDENT, 'loan-1'),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('forbids a student from returning another patron\'s loan', async () => {
      loanModel.findById.mockResolvedValue({
        patronId: 'someone-else',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        save: jest.fn(),
      });

      await expect(
        service.returnLoan('student-1', Role.STUDENT, 'loan-1'),
      ).rejects.toBeInstanceOf(ForbiddenDomainException);
    });

    it('rejects returning an already-returned loan', async () => {
      loanModel.findById.mockResolvedValue({
        patronId: 'student-1',
        status: LoanStatus.RETURNED,
        itemId: 'item-1',
        save: jest.fn(),
      });

      await expect(
        service.returnLoan('student-1', Role.STUDENT, 'loan-1'),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('marks the loan returned, restocks the item, and creates a receipt', async () => {
      const loan: any = {
        _id: 'loan-1',
        patronId: 'student-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        save: jest.fn().mockResolvedValue(undefined),
      };
      const item: any = {
        _id: 'item-1',
        title: 'Clean Code',
        author: 'Robert Martin',
        servicePoint: 'main',
        availableCopies: 0,
        totalCopies: 2,
        save: jest.fn().mockResolvedValue(undefined),
      };
      loanModel.findById.mockResolvedValue(loan);
      itemModel.findById.mockResolvedValue(item);
      receiptModel.create.mockResolvedValue({
        transactionId: 'txn-2',
        type: 'return',
        itemTitle: 'Clean Code',
        itemAuthor: 'Robert Martin',
        returnedAt: new Date(),
        policy: 'Standard 14-day loan, max 2 renewals',
        servicePoint: 'main',
        createdAt: new Date(),
      });

      const receipt = await service.returnLoan('student-1', Role.STUDENT, 'loan-1');

      expect(loan.status).toBe(LoanStatus.RETURNED);
      expect(item.availableCopies).toBe(1);
      expect(receipt.transactionId).toBe('txn-2');
    });
  });

  describe('renewLoan', () => {
    it('rejects renewal once the renewal limit is reached', async () => {
      loanModel.findById.mockResolvedValue({
        patronId: 'student-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        renewalCount: 2,
        maxRenewals: 2,
        save: jest.fn(),
      });

      await expect(
        service.renewLoan('student-1', Role.STUDENT, 'loan-1'),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('rejects renewal when another patron holds the item', async () => {
      loanModel.findById.mockResolvedValue({
        patronId: 'student-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        renewalCount: 0,
        maxRenewals: 2,
        dueAt: new Date(),
        save: jest.fn(),
      });
      holdModel.exists.mockResolvedValue(true);

      await expect(
        service.renewLoan('student-1', Role.STUDENT, 'loan-1'),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });
  });

  describe('lookupPatronLoans', () => {
    it('records an audit entry for every staff lookup', async () => {
      loanModel.find.mockReturnValue(findManyChain([]));
      loanModel.countDocuments.mockResolvedValue(0);
      lookupAuditModel.create.mockResolvedValue({});

      await service.lookupPatronLoans('librarian-1', 'student-1', {}, 'req-1');

      expect(lookupAuditModel.create).toHaveBeenCalledWith({
        staffId: 'librarian-1',
        patronId: 'student-1',
        resultCount: 0,
        requestId: 'req-1',
      });
    });
  });

  describe('requestDueDateOverride', () => {
    it('applies immediately when within the staff extension limit', async () => {
      const loan: any = {
        _id: 'loan-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        patronId: 'student-1',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
        save: jest.fn().mockResolvedValue(undefined),
      };
      loanModel.findById.mockResolvedValue(loan);
      holdModel.exists.mockResolvedValue(false);
      overrideModel.create.mockImplementation((doc: any) => Promise.resolve(doc));

      const override = await service.requestDueDateOverride('librarian-1', 'loan-1', {
        newDueAt: '2026-01-05T00:00:00.000Z',
        reason: 'Medical emergency',
      });

      expect(override.status).toBe(DueDateOverrideStatus.APPLIED);
      expect(loan.save).toHaveBeenCalled();
    });

    it('requires elevated approval when the extension exceeds the staff limit', async () => {
      const loan: any = {
        _id: 'loan-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        patronId: 'student-1',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
        save: jest.fn().mockResolvedValue(undefined),
      };
      loanModel.findById.mockResolvedValue(loan);
      holdModel.exists.mockResolvedValue(false);
      overrideModel.create.mockImplementation((doc: any) => Promise.resolve(doc));

      const override = await service.requestDueDateOverride('librarian-1', 'loan-1', {
        newDueAt: '2026-03-01T00:00:00.000Z',
        reason: 'Extended leave',
      });

      expect(override.status).toBe(DueDateOverrideStatus.PENDING_APPROVAL);
      expect(override.exceedsStaffLimit).toBe(true);
      expect(loan.save).not.toHaveBeenCalled();
    });

    it('requires elevated approval when another patron holds the item', async () => {
      const loan: any = {
        _id: 'loan-1',
        status: LoanStatus.ACTIVE,
        itemId: 'item-1',
        patronId: 'student-1',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
        save: jest.fn().mockResolvedValue(undefined),
      };
      loanModel.findById.mockResolvedValue(loan);
      holdModel.exists.mockResolvedValue(true);
      overrideModel.create.mockImplementation((doc: any) => Promise.resolve(doc));

      const override = await service.requestDueDateOverride('librarian-1', 'loan-1', {
        newDueAt: '2026-01-05T00:00:00.000Z',
        reason: 'Extend by a few days',
      });

      expect(override.status).toBe(DueDateOverrideStatus.PENDING_APPROVAL);
      expect(override.hasHoldConflict).toBe(true);
    });
  });

  describe('resolveDueDateOverride', () => {
    it('throws not-found for an unknown override', async () => {
      overrideModel.findById.mockResolvedValue(null);

      await expect(
        service.resolveDueDateOverride('admin-1', 'override-1', { approve: true }),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('rejects resolving an already-resolved override', async () => {
      overrideModel.findById.mockResolvedValue({
        status: DueDateOverrideStatus.APPROVED,
        save: jest.fn(),
      });

      await expect(
        service.resolveDueDateOverride('admin-1', 'override-1', { approve: true }),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('applies the new due date to the loan on approval', async () => {
      const override: any = {
        loanId: 'loan-1',
        newDueAt: new Date('2026-03-01T00:00:00.000Z'),
        status: DueDateOverrideStatus.PENDING_APPROVAL,
        save: jest.fn().mockResolvedValue(undefined),
      };
      const loan: any = { save: jest.fn().mockResolvedValue(undefined) };
      overrideModel.findById.mockResolvedValue(override);
      loanModel.findById.mockResolvedValue(loan);

      await service.resolveDueDateOverride('admin-1', 'override-1', {
        approve: true,
        note: 'Approved per policy exception',
      });

      expect(loan.dueAt).toBe(override.newDueAt);
      expect(loan.save).toHaveBeenCalled();
      expect(override.status).toBe(DueDateOverrideStatus.APPROVED);
    });
  });

  describe('getReceipt', () => {
    it('throws not-found for an unknown transaction id', async () => {
      receiptModel.findOne.mockReturnValue(leanChain(null));

      await expect(
        service.getReceipt('student-1', Role.STUDENT, 'txn-missing'),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('forbids access to a receipt owned by another patron', async () => {
      receiptModel.findOne.mockReturnValue(
        leanChain({ patronId: 'someone-else', transactionId: 'txn-1' }),
      );

      await expect(
        service.getReceipt('student-1', Role.STUDENT, 'txn-1'),
      ).rejects.toBeInstanceOf(ForbiddenDomainException);
    });

    it('allows library staff to access any receipt', async () => {
      receiptModel.findOne.mockReturnValue(
        leanChain({
          patronId: 'someone-else',
          transactionId: 'txn-1',
          type: 'checkout',
          itemTitle: 'Clean Code',
          itemAuthor: 'Robert Martin',
          policy: 'Standard 14-day loan, max 2 renewals',
          servicePoint: 'main',
          createdAt: new Date(),
        }),
      );

      const receipt = await service.getReceipt('librarian-1', Role.LIBRARIAN, 'txn-1');

      expect(receipt.transactionId).toBe('txn-1');
    });
  });
});
