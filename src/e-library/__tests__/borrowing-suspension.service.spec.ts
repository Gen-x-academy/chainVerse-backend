import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BorrowingSuspensionService } from '../services/borrowing-suspension.service';
import {
  BorrowingSuspension,
  BorrowingSuspensionDocument,
  SuspensionReason,
  SuspensionStatus,
} from '../schemas/borrowing-suspension.schema';
import {
  PatronProfile,
  PatronProfileDocument,
  PatronStatus,
} from '../schemas/patron-profile.schema';
import { Loan, LoanDocument, LoanStatus } from '../schemas/loan.schema';
import {
  PatronBalance,
  PatronBalanceDocument,
} from '../schemas/patron-balance.schema';
import { CreateSuspensionDto, LiftSuspensionDto } from '../dto/borrowing-suspension.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';

// Override threshold constants to use predictable test values.
jest.mock('../e-library.constants', () => ({
  SUSPENSION_OVERDUE_COUNT_THRESHOLD: 3,
  SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD: 30,
  SUSPENSION_UNPAID_BALANCE_THRESHOLD: 5000,
  DEFAULT_CURRENCY: 'USD',
}));

describe('BorrowingSuspensionService', () => {
  let service: BorrowingSuspensionService;
  let suspensionModel: jest.Mocked<Model<BorrowingSuspensionDocument>>;
  let patronModel: jest.Mocked<Model<PatronProfileDocument>>;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let balanceModel: jest.Mocked<Model<PatronBalanceDocument>>;

  const PATRON_ID = 'patron-abc';
  const STAFF_ID = 'staff-001';
  const SUSPENSION_ID = '507f1f77bcf86cd799439099';

  const mockPatron = {
    _id: 'patron-profile-1',
    platformUserId: PATRON_ID,
    status: PatronStatus.ACTIVE,
    role: 'student',
  };

  const mockSuspendedPatron = {
    ...mockPatron,
    status: PatronStatus.SUSPENDED,
  };

  const mockActiveSuspension = {
    _id: SUSPENSION_ID,
    patronId: PATRON_ID,
    status: SuspensionStatus.ACTIVE,
    reason: SuspensionReason.OVERDUE_COUNT,
    message: 'Suspended due to 3 overdue items',
    thresholdSnapshot: {
      thresholdName: 'overdue_count',
      thresholdValue: 3,
      measuredValue: 3,
    },
    autoLift: true,
    suspendedUntil: null,
    createdBy: 'system:reconciliation',
    liftedBy: null,
    liftNote: null,
    liftedAt: null,
  };

  beforeEach(async () => {
    suspensionModel = {
      findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
        }),
      }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      create: jest.fn().mockResolvedValue(mockActiveSuspension),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      countDocuments: jest.fn().mockResolvedValue(0),
    } as any;

    patronModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockPatron) }),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    } as any;

    loanModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
          }),
        }),
      }),
    } as any;

    balanceModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BorrowingSuspensionService,
        {
          provide: getModelToken(BorrowingSuspension.name),
          useValue: suspensionModel,
        },
        {
          provide: getModelToken(PatronProfile.name),
          useValue: patronModel,
        },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        {
          provide: getModelToken(PatronBalance.name),
          useValue: balanceModel,
        },
      ],
    }).compile();

    service = module.get<BorrowingSuspensionService>(BorrowingSuspensionService);
  });

  describe('checkThresholds', () => {
    it('should return not suspended when all metrics are below thresholds', async () => {
      loanModel.countDocuments = jest.fn().mockResolvedValue(0);
      balanceModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ balanceMinorUnits: 0 }),
        }),
      });

      const result = await service.checkThresholds(PATRON_ID);
      expect(result.suspended).toBe(false);
    });

    it('should flag OVERDUE_COUNT when overdue count >= threshold (3)', async () => {
      loanModel.countDocuments = jest.fn().mockResolvedValue(3);

      const result = await service.checkThresholds(PATRON_ID);
      expect(result.suspended).toBe(true);
      expect(result.reason).toBe(SuspensionReason.OVERDUE_COUNT);
      expect(result.thresholdSnapshot?.measuredValue).toBe(3);
    });

    it('should flag OVERDUE_AGE when oldest overdue loan exceeds age threshold (30 days)', async () => {
      loanModel.countDocuments = jest.fn().mockResolvedValue(1);
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 35); // 35 days ago
      loanModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({ dueDate: overdueDate }),
            }),
          }),
        }),
      });

      const result = await service.checkThresholds(PATRON_ID);
      expect(result.suspended).toBe(true);
      expect(result.reason).toBe(SuspensionReason.OVERDUE_AGE);
      expect(result.thresholdSnapshot!.measuredValue).toBeGreaterThanOrEqual(35);
    });

    it('should flag UNPAID_BALANCE when balance >= threshold (5000)', async () => {
      loanModel.countDocuments = jest.fn().mockResolvedValue(0);
      balanceModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ balanceMinorUnits: 6000 }),
        }),
      });

      const result = await service.checkThresholds(PATRON_ID);
      expect(result.suspended).toBe(true);
      expect(result.reason).toBe(SuspensionReason.UNPAID_BALANCE);
    });
  });

  describe('reconcile', () => {
    it('should apply suspension when thresholds are exceeded', async () => {
      loanModel.countDocuments = jest.fn().mockResolvedValue(3);

      const result = await service.reconcile(PATRON_ID);

      expect(result.nowSuspended).toBe(true);
      expect(suspensionModel.create).toHaveBeenCalled();
      expect(patronModel.findOneAndUpdate).toHaveBeenCalledWith(
        { platformUserId: PATRON_ID },
        expect.objectContaining({
          $set: expect.objectContaining({ status: PatronStatus.SUSPENDED }),
        }),
      );
    });

    it('should auto-lift suspension when all thresholds are resolved', async () => {
      // Patron is currently suspended
      patronModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSuspendedPatron),
      });
      // All metrics are below thresholds
      loanModel.countDocuments = jest.fn().mockResolvedValue(0);
      balanceModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ balanceMinorUnits: 0 }),
        }),
      });

      const result = await service.reconcile(PATRON_ID);

      expect(result.wasSuspended).toBe(true);
      expect(result.nowSuspended).toBe(false);
      expect(suspensionModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: SuspensionStatus.ACTIVE, autoLift: true }),
        expect.objectContaining({ $set: expect.objectContaining({ status: SuspensionStatus.LIFTED_AUTO }) }),
      );
    });
  });

  describe('suspend (manual)', () => {
    it('should create a manual suspension for an active patron', async () => {
      const dto: CreateSuspensionDto = {
        patronId: PATRON_ID,
        message: 'Manual suspension for unpaid fees',
      };

      const result = await service.suspend(dto, STAFF_ID);

      expect(suspensionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          patronId: PATRON_ID,
          reason: SuspensionReason.MANUAL,
          createdBy: STAFF_ID,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should reject if patron is already suspended', async () => {
      patronModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSuspendedPatron),
      });

      const dto: CreateSuspensionDto = {
        patronId: PATRON_ID,
        message: 'Redundant',
      };

      await expect(service.suspend(dto, STAFF_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });

    it('should throw ResourceNotFoundException if patron profile not found', async () => {
      patronModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.suspend({ patronId: 'unknown', message: 'test' }, STAFF_ID),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('liftException', () => {
    beforeEach(() => {
      suspensionModel.findById = jest
        .fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockActiveSuspension) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue({ ...mockActiveSuspension, status: SuspensionStatus.LIFTED_EXCEPTION }) });
    });

    it('should lift an active suspension as a staff exception', async () => {
      const dto: LiftSuspensionDto = { liftNote: 'Patron has resolved outstanding items' };

      const result = await service.liftException(SUSPENSION_ID, dto, 'staff-002');

      expect(suspensionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        SUSPENSION_ID,
        expect.objectContaining({
          $set: expect.objectContaining({
            status: SuspensionStatus.LIFTED_EXCEPTION,
            liftedBy: 'staff-002',
          }),
        }),
      );
    });

    it('should enforce maker-checker: creator cannot lift their own suspension', async () => {
      const dto: LiftSuspensionDto = { liftNote: 'Self-lift attempt' };

      // The mock suspension has createdBy: 'system:reconciliation';
      // use a suspension created by the same staff member
      suspensionModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockActiveSuspension,
          createdBy: STAFF_ID,
        }),
      });

      await expect(
        service.liftException(SUSPENSION_ID, dto, STAFF_ID),
      ).rejects.toBeInstanceOf(ForbiddenDomainException);
    });

    it('should reject if suspension is not in ACTIVE status', async () => {
      suspensionModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockActiveSuspension,
          status: SuspensionStatus.LIFTED_AUTO,
        }),
      });

      const dto: LiftSuspensionDto = { liftNote: 'Already lifted' };
      await expect(
        service.liftException(SUSPENSION_ID, dto, STAFF_ID),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should throw ResourceNotFoundException if suspension not found', async () => {
      suspensionModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.liftException('nonexistent', { liftNote: 'test' }, STAFF_ID),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });
});
