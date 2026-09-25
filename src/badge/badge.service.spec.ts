import { Test, TestingModule } from '@nestjs/testing';
import { BadgeService } from './badge.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Badge, BadgeDocument } from './schemas/badge.schema';
import { BadgeAward, BadgeAwardDocument } from './schemas/badge-award.schema';

describe('BadgeService', () => {
  let service: BadgeService;
  let badgeModel: jest.Mocked<Model<BadgeDocument>>;
  let badgeAwardModel: jest.Mocked<Model<BadgeAwardDocument>>;

  const mockBadge = (overrides: Record<string, unknown> = {}) => ({
    _id: 'badge-1',
    name: 'Course Explorer',
    description: 'Complete 5 courses',
    metadata: {
      evaluationRules: [
        {
          eventName: 'certificate.issued',
          metric: 'coursesCompleted',
          threshold: 5,
        },
      ],
    },
    ...overrides,
  });

  const mockAward = (overrides: Record<string, unknown> = {}) => ({
    _id: 'award-1',
    userId: 'user-1',
    badgeId: 'badge-1',
    metadata: { metrics: { coursesCompleted: 5 } },
    save: jest.fn(),
    ...overrides,
  });

  beforeEach(async () => {
    badgeModel = {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    } as unknown as jest.Mocked<Model<BadgeDocument>>;

    badgeAwardModel = {
      countDocuments: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Model<BadgeAwardDocument>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: getModelToken(Badge.name), useValue: badgeModel },
        { provide: getModelToken(BadgeAward.name), useValue: badgeAwardModel },
      ],
    }).compile();

    service = module.get<BadgeService>(BadgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateAndAward', () => {
    it('should award badge when all rules match', async () => {
      const badgeDoc = mockBadge() as unknown as BadgeDocument;
      badgeModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([badgeDoc]),
      } as any);

      const saveMock = jest.fn().mockResolvedValue(mockAward());
      const originalBadgeAwardModel = badgeAwardModel as any;
      originalBadgeAwardModel.prototype = Object.create(
        Object.getPrototypeOf(badgeAwardModel),
      );

      // We need to mock the constructor behavior
      const MockBadgeAwardModel = jest.fn().mockImplementation(() => ({
        save: saveMock,
      }));

      // Re-create service with mocked constructor model
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          BadgeService,
          { provide: getModelToken(Badge.name), useValue: badgeModel },
          {
            provide: getModelToken(BadgeAward.name),
            useValue: MockBadgeAwardModel,
          },
        ],
      }).compile();

      const service2 = module2.get<BadgeService>(BadgeService);

      const result = await service2.evaluateAndAward(
        'user-1',
        'certificate.issued',
        { coursesCompleted: 5 },
      );

      expect(result).toHaveLength(1);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should not award badge when threshold is not met', async () => {
      const badgeDoc = mockBadge() as unknown as BadgeDocument;
      badgeModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([badgeDoc]),
      } as any);

      const result = await service.evaluateAndAward(
        'user-1',
        'certificate.issued',
        { coursesCompleted: 3 },
      );

      expect(result).toHaveLength(0);
    });

    it('should not award badge when event name does not match', async () => {
      const badgeDoc = mockBadge() as unknown as BadgeDocument;
      badgeModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([badgeDoc]),
      } as any);

      const result = await service.evaluateAndAward(
        'user-1',
        'quiz.passed',
        { coursesCompleted: 5 },
      );

      expect(result).toHaveLength(0);
    });

    it('should skip badges with no evaluation rules', async () => {
      const badgeNoRules = mockBadge({ metadata: {} }) as unknown as BadgeDocument;
      badgeModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([badgeNoRules]),
      } as any);

      const result = await service.evaluateAndAward(
        'user-1',
        'certificate.issued',
        { coursesCompleted: 5 },
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('awardBadge', () => {
    it('should award badge and return the award', async () => {
      const saveMock = jest.fn().mockResolvedValue({ _id: 'award-1' });
      const MockBadgeAwardModel = jest.fn().mockImplementation(() => ({
        save: saveMock,
      }));

      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          BadgeService,
          { provide: getModelToken(Badge.name), useValue: badgeModel },
          {
            provide: getModelToken(BadgeAward.name),
            useValue: MockBadgeAwardModel,
          },
        ],
      }).compile();

      const service2 = module2.get<BadgeService>(BadgeService);
      const badgeDoc = mockBadge() as unknown as BadgeDocument;

      const result = await service2.awardBadge('user-1', badgeDoc, {
        coursesCompleted: 5,
      });

      expect(result).not.toBeNull();
      expect(saveMock).toHaveBeenCalled();
    });

    it('should return null when badge already awarded (duplicate key)', async () => {
      const dupError = new Error('Duplicate key') as any;
      dupError.code = 11000;
      const saveMock = jest.fn().mockRejectedValue(dupError);
      const MockBadgeAwardModel = jest.fn().mockImplementation(() => ({
        save: saveMock,
      }));

      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          BadgeService,
          { provide: getModelToken(Badge.name), useValue: badgeModel },
          {
            provide: getModelToken(BadgeAward.name),
            useValue: MockBadgeAwardModel,
          },
        ],
      }).compile();

      const service2 = module2.get<BadgeService>(BadgeService);
      const badgeDoc = mockBadge() as unknown as BadgeDocument;

      const result = await service2.awardBadge('user-1', badgeDoc);

      expect(result).toBeNull();
    });
  });

  describe('hasAwarded', () => {
    it('should return true when award exists', async () => {
      badgeAwardModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      } as any);

      const result = await service.hasAwarded('user-1', 'badge-1');
      expect(result).toBe(true);
    });

    it('should return false when no award exists', async () => {
      badgeAwardModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      } as any);

      const result = await service.hasAwarded('user-1', 'badge-1');
      expect(result).toBe(false);
    });
  });

  describe('getUserAwards', () => {
    it('should return awards for a user', async () => {
      const awards = [
        { userId: 'user-1', badgeId: 'badge-1' },
        { userId: 'user-1', badgeId: 'badge-2' },
      ];
      badgeAwardModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(awards),
      } as any);

      const result = await service.getUserAwards('user-1');
      expect(result).toEqual(awards);
      expect(badgeAwardModel.find).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });
});
