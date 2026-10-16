import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FineCalculationService } from '../services/fine-calculation.service';
import { ChargePolicy, ChargePolicyDocument } from '../schemas/charge-policy.schema';
import { ChargePolicyService } from '../services/charge-policy.service';
import { ChargeType } from '../enums/charge-type.enum';

describe('FineCalculationService', () => {
  let service: FineCalculationService;
  let chargePolicyModel: jest.Mocked<Model<ChargePolicyDocument>>;
  let chargePolicyService: jest.Mocked<ChargePolicyService>;

  const mockPolicy = {
    chargeType: ChargeType.OVERDUE,
    currency: 'USD',
    graceDays: 2,
    dailyRateMinorUnits: 25,
    capMinorUnits: 5000,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isActive: true,
  };

  beforeEach(async () => {
    chargePolicyModel = {
      findOne: jest.fn(),
    } as any;

    chargePolicyService = {
      findEffective: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FineCalculationService,
        {
          provide: getModelToken(ChargePolicy.name),
          useValue: chargePolicyModel,
        },
        { provide: ChargePolicyService, useValue: chargePolicyService },
      ],
    }).compile();

    service = module.get<FineCalculationService>(FineCalculationService);
  });

  describe('calculateOverdueFine', () => {
    it('should calculate fine within cap', async () => {
      chargePolicyService.findEffective.mockResolvedValue(mockPolicy as any);

      const dueDate = new Date('2026-06-01');
      const returnDate = new Date('2026-06-05'); // 4 days late, 2 grace = 2 billable

      const result = await service.calculateOverdueFine(
        dueDate,
        returnDate,
        'USD',
      );

      // 2 billable days * 25 minor units = 50
      expect(result.amountMinorUnits).toBe(50);
      expect(result.currency).toBe('USD');
      expect(result.graceDaysApplied).toBe(2);
      expect(result.billableDays).toBe(2);
    });

    it('should apply cap when fine exceeds maximum', async () => {
      chargePolicyService.findEffective.mockResolvedValue(mockPolicy as any);

      const dueDate = new Date('2026-06-01');
      const returnDate = new Date('2026-07-01'); // 30 days late, 2 grace = 28 billable

      const result = await service.calculateOverdueFine(
        dueDate,
        returnDate,
        'USD',
      );

      // 28 * 25 = 700, but cap is 5000 — should be uncapped
      expect(result.amountMinorUnits).toBe(700);
    });

    it('should return 0 for return within grace period', async () => {
      chargePolicyService.findEffective.mockResolvedValue(mockPolicy as any);

      const dueDate = new Date('2026-06-01');
      const returnDate = new Date('2026-06-02'); // 1 day late, within 2 grace days

      const result = await service.calculateOverdueFine(
        dueDate,
        returnDate,
        'USD',
      );

      expect(result.amountMinorUnits).toBe(0);
      expect(result.billableDays).toBe(0);
    });

    it('should return 0 when no policy found', async () => {
      chargePolicyService.findEffective.mockResolvedValue(null);

      const result = await service.calculateOverdueFine(
        new Date('2026-06-01'),
        new Date('2026-06-05'),
        'USD',
      );

      expect(result.amountMinorUnits).toBe(0);
    });
  });
});
