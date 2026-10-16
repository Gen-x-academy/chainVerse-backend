import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LedgerService } from '../services/ledger.service';
import { LedgerEntry, LedgerEntryDocument } from '../schemas/ledger-entry.schema';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';

describe('LedgerService', () => {
  let service: LedgerService;
  let ledgerModel: jest.Mocked<Model<LedgerEntryDocument>>;

  const mockEntry = {
    _id: '507f1f77bcf86cd799439011',
    patronId: 'patron-1',
    loanId: 'loan-1',
    entryType: LedgerEntryType.CHARGE,
    amountMinorUnits: 500,
    currency: 'USD',
    balanceBeforeMinorUnits: 0,
    balanceAfterMinorUnits: 500,
    reason: 'Overdue fine',
    referenceEntryId: null,
    createdBy: 'system',
    metadata: {},
  };

  beforeEach(async () => {
    ledgerModel = {
      create: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: getModelToken(LedgerEntry.name), useValue: ledgerModel },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  describe('recordEntry', () => {
    it('should create a ledger entry', async () => {
      ledgerModel.create.mockResolvedValue(mockEntry as any);

      const result = await service.recordEntry({
        patronId: 'patron-1',
        loanId: 'loan-1',
        entryType: LedgerEntryType.CHARGE,
        amountMinorUnits: 500,
        currency: 'USD',
        balanceBeforeMinorUnits: 0,
        balanceAfterMinorUnits: 500,
        reason: 'Overdue fine',
        createdBy: 'system',
      });

      expect(result).toEqual(mockEntry);
      expect(ledgerModel.create).toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('should aggregate total balance for a patron', async () => {
      ledgerModel.aggregate.mockResolvedValue([{ totalBalance: 500 }]);

      const result = await service.getBalance('patron-1', 'USD');

      expect(result).toBe(500);
    });

    it('should return 0 when no entries exist', async () => {
      ledgerModel.aggregate.mockResolvedValue([]);

      const result = await service.getBalance('patron-1', 'USD');

      expect(result).toBe(0);
    });
  });

  describe('getEntriesForPatron', () => {
    it('should return entries sorted by date descending', async () => {
      ledgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockEntry]),
        }),
      } as any);

      const result = await service.getEntriesForPatron('patron-1', 'USD');

      expect(result).toEqual([mockEntry]);
    });
  });
});
