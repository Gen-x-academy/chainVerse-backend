import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PointsService } from './points.service';
import { PointsRecord } from './schemas/points.schema';
import {
  PointLedgerEntry,
  LedgerEntryEventType,
} from './schemas/point-ledger-entry.schema';

describe('PointsService', () => {
  let service: PointsService;
  let ledgerFindOneAndUpdate: jest.Mock;
  let ledgerFindOne: jest.Mock;
  let ledgerAggregate: jest.Mock;
  let ledgerFind: jest.Mock;
  let pointsFind: jest.Mock;
  let pointsFindById: jest.Mock;
  let pointsFindByIdAndUpdate: jest.Mock;
  let pointsFindByIdAndDelete: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    ledgerFindOneAndUpdate = jest.fn();
    ledgerFindOne = jest.fn();
    ledgerAggregate = jest.fn();
    ledgerFind = jest.fn();

    pointsFind = jest.fn();
    pointsFindById = jest.fn();
    pointsFindByIdAndUpdate = jest.fn();
    pointsFindByIdAndDelete = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsService,
        {
          provide: getModelToken(PointsRecord.name),
          useValue: {
            find: pointsFind,
            findById: pointsFindById,
            findByIdAndUpdate: pointsFindByIdAndUpdate,
            findByIdAndDelete: pointsFindByIdAndDelete,
          },
        },
        {
          provide: getModelToken(PointLedgerEntry.name),
          useValue: {
            find: ledgerFind,
            findOne: ledgerFindOne,
            findOneAndUpdate: ledgerFindOneAndUpdate,
            aggregate: ledgerAggregate,
          },
        },
      ],
    }).compile();

    service = module.get<PointsService>(PointsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLedgerEntry', () => {
    it('should create an award ledger entry with correct amount', async () => {
      const dto = {
        userId: 'user-123',
        eventType: LedgerEntryEventType.AWARD,
        amount: 50,
        source: 'course_enrollment',
        idempotencyKey: 'key-123',
        referenceId: 'course-456',
        metadata: { courseId: 'course-456' },
      };

      const expectedEntry = {
        _id: 'entry-1',
        ...dto,
        amount: 50,
        createdAt: new Date(),
      };

      ledgerFindOneAndUpdate.mockResolvedValue(expectedEntry);

      const result = await service.createLedgerEntry(dto);

      expect(ledgerFindOneAndUpdate).toHaveBeenCalledWith(
        { idempotencyKey: 'key-123' },
        {
          $setOnInsert: {
            userId: 'user-123',
            eventType: LedgerEntryEventType.AWARD,
            amount: 50,
            source: 'course_enrollment',
            idempotencyKey: 'key-123',
            referenceId: 'course-456',
            metadata: { courseId: 'course-456' },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      expect(result).toEqual(expectedEntry);
    });

    it('should negate amount for deduction entries', async () => {
      const dto = {
        userId: 'user-123',
        eventType: LedgerEntryEventType.DEDUCTION,
        amount: 25,
        source: 'penalty',
        idempotencyKey: 'key-456',
      };

      ledgerFindOneAndUpdate.mockResolvedValue({
        _id: 'entry-2',
        ...dto,
        amount: -25,
      });

      await service.createLedgerEntry(dto);

      expect(ledgerFindOneAndUpdate).toHaveBeenCalledWith(
        { idempotencyKey: 'key-456' },
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          $setOnInsert: expect.objectContaining({ amount: -25 }),
        }),
        expect.any(Object),
      );
    });

    it('should return existing entry on duplicate idempotencyKey', async () => {
      const dto = {
        userId: 'user-123',
        eventType: LedgerEntryEventType.AWARD,
        amount: 50,
        source: 'course_enrollment',
        idempotencyKey: 'key-dup',
      };

      const duplicateError = new Error('duplicate key');
      Object.defineProperty(duplicateError, 'code', { value: 11000 });
      ledgerFindOneAndUpdate.mockRejectedValue(duplicateError);

      const existingEntry = { _id: 'existing', idempotencyKey: 'key-dup' };
      ledgerFindOne.mockResolvedValue(existingEntry);

      const result = await service.createLedgerEntry(dto);

      expect(ledgerFindOne).toHaveBeenCalledWith({
        idempotencyKey: 'key-dup',
      });
      expect(result).toEqual(existingEntry);
    });

    it('should rethrow non-duplicate errors', async () => {
      const dto = {
        userId: 'user-123',
        eventType: LedgerEntryEventType.AWARD,
        amount: 50,
        source: 'test',
        idempotencyKey: 'key-err',
      };

      const dbError = new Error('connection lost');
      ledgerFindOneAndUpdate.mockRejectedValue(dbError);

      await expect(service.createLedgerEntry(dto)).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('getUserBalance', () => {
    it('should return 0 balance when no entries exist', async () => {
      ledgerAggregate.mockResolvedValue([]);

      const result = await service.getUserBalance('user-123');

      expect(result).toEqual({ userId: 'user-123', balance: 0 });
    });

    it('should aggregate amounts from ledger entries', async () => {
      ledgerAggregate.mockResolvedValue([{ _id: null, balance: 110 }]);

      const result = await service.getUserBalance('user-123');

      expect(ledgerAggregate).toHaveBeenCalledWith([
        { $match: { userId: 'user-123' } },
        { $group: { _id: null, balance: { $sum: '$amount' } } },
      ]);
      expect(result).toEqual({ userId: 'user-123', balance: 110 });
    });
  });

  describe('getUserLedgerEntries', () => {
    it('should return entries sorted by createdAt descending', async () => {
      const entries = [
        { _id: '2', userId: 'user-123', amount: 100 },
        { _id: '1', userId: 'user-123', amount: 10 },
      ];
      const mockExec = jest.fn().mockResolvedValue(entries);
      const mockSort = jest.fn().mockReturnValue({ exec: mockExec });
      ledgerFind.mockReturnValue({ sort: mockSort });

      const result = await service.getUserLedgerEntries('user-123');

      expect(ledgerFind).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toHaveLength(2);
    });
  });

  describe('getUserPoints (legacy)', () => {
    it('should sum points from legacy records', async () => {
      const mockRecords = [{ points: 10 }, { points: 50 }, { points: 20 }];
      const mockExec = jest.fn().mockResolvedValue(mockRecords);
      pointsFind.mockReturnValue({ exec: mockExec });

      const result = await service.getUserPoints('user-123');

      expect(result).toEqual({
        userId: 'user-123',
        totalPoints: 80,
        records: mockRecords,
      });
    });
  });
});
