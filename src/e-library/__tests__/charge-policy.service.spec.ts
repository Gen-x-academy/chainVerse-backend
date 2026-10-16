import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChargePolicyService } from '../services/charge-policy.service';
import { ChargePolicy, ChargePolicyDocument } from '../schemas/charge-policy.schema';
import { ChargeType } from '../enums/charge-type.enum';

describe('ChargePolicyService', () => {
  let service: ChargePolicyService;
  let chargePolicyModel: jest.Mocked<Model<ChargePolicyDocument>>;

  const mockPolicy = {
    _id: '507f1f77bcf86cd799439011',
    chargeType: ChargeType.OVERDUE,
    currency: 'USD',
    graceDays: 2,
    dailyRateMinorUnits: 25,
    capMinorUnits: 5000,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    createdBy: 'admin-1',
  };

  beforeEach(async () => {
    chargePolicyModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChargePolicyService,
        {
          provide: getModelToken(ChargePolicy.name),
          useValue: chargePolicyModel,
        },
      ],
    }).compile();

    service = module.get<ChargePolicyService>(ChargePolicyService);
  });

  describe('create', () => {
    it('should create a new charge policy', async () => {
      chargePolicyModel.create.mockResolvedValue(mockPolicy as any);

      const result = await service.create({
        chargeType: ChargeType.OVERDUE,
        currency: 'USD',
        graceDays: 2,
        dailyRateMinorUnits: 25,
        capMinorUnits: 5000,
        effectiveFrom: new Date('2026-01-01'),
        createdBy: 'admin-1',
      } as any);

      expect(result).toEqual(mockPolicy);
      expect(chargePolicyModel.create).toHaveBeenCalled();
    });

    it('should deactivate previous policy when creating new one', async () => {
      chargePolicyModel.updateMany.mockResolvedValue({} as any);
      chargePolicyModel.create.mockResolvedValue(mockPolicy as any);

      await service.create({
        chargeType: ChargeType.OVERDUE,
        currency: 'USD',
        graceDays: 2,
        dailyRateMinorUnits: 25,
        capMinorUnits: 5000,
        effectiveFrom: new Date('2026-06-01'),
        createdBy: 'admin-1',
      } as any);

      expect(chargePolicyModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          chargeType: ChargeType.OVERDUE,
          currency: 'USD',
          isActive: true,
        }),
        expect.objectContaining({ effectiveTo: expect.any(Date) }),
      );
    });
  });

  describe('findEffective', () => {
    it('should find the active policy for a charge type', async () => {
      chargePolicyModel.findOne.mockResolvedValue(mockPolicy as any);

      const result = await service.findEffective(
        ChargeType.OVERDUE,
        'USD',
        new Date('2026-06-01'),
      );

      expect(result).toEqual(mockPolicy);
    });

    it('should return null when no policy found', async () => {
      chargePolicyModel.findOne.mockResolvedValue(null);

      const result = await service.findEffective(
        ChargeType.OVERDUE,
        'USD',
        new Date('2030-01-01'),
      );

      expect(result).toBeNull();
    });
  });
});
