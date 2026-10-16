import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StreakService } from './streak.service';
import {
  LearningStreak,
  LearningStreakDocument,
} from './schemas/learning-streak.schema';

describe('StreakService', () => {
  let service: StreakService;
  let model: Model<LearningStreakDocument>;

  const mockStreakModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    exec: jest.fn(),
  };

  const mockDocument = (overrides: Partial<LearningStreak> = {}) => {
    const doc = {
      userId: 'user-1',
      date: new Date('2026-08-25T00:00:00.000Z'),
      qualified: true,
      activityCount: 1,
      timezone: 'UTC',
      streakCount: 1,
      save: jest.fn().mockResolvedValue(this),
      ...overrides,
    };
    doc.save = jest.fn().mockResolvedValue(doc);
    return doc;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakService,
        {
          provide: getModelToken(LearningStreak.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
                limit: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<StreakService>(StreakService);
    model = module.get<Model<LearningStreakDocument>>(
      getModelToken(LearningStreak.name),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordActivity', () => {
    it('should create a new streak record when no record exists for today', async () => {
      const mockDoc = mockDocument();
      model.findOne = jest.fn().mockResolvedValue(null);

      const MockModel = function (this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
      };
      (MockModel as any).findOne = model.findOne;

      const testService = new StreakService(MockModel as any);
      const result = await testService.recordActivity('user-1', 'UTC');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
    });

    it('should update existing record for today', async () => {
      const existingDoc = mockDocument({ activityCount: 1 });
      model.findOne = jest.fn().mockResolvedValue(existingDoc);

      const result = await service.recordActivity('user-1', 'UTC');

      expect(existingDoc.activityCount).toBe(2);
      expect(existingDoc.save).toHaveBeenCalled();
    });
  });

  describe('getStreak', () => {
    it('should return zero streak for new user', async () => {
      model.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getStreak('user-1', 'UTC');

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.lastActivityDate).toBeNull();
      expect(result.qualifiedDays).toBe(0);
    });

    it('should return streak data for user with records', async () => {
      const records = [
        mockDocument({ date: new Date('2026-08-25T00:00:00.000Z') }),
        mockDocument({ date: new Date('2026-08-24T00:00:00.000Z') }),
        mockDocument({ date: new Date('2026-08-23T00:00:00.000Z') }),
      ];

      model.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(records),
        }),
      });

      model.findOne = jest.fn()
        .mockResolvedValueOnce(mockDocument({ date: new Date('2026-08-25T00:00:00.000Z') }))
        .mockResolvedValueOnce(mockDocument({ date: new Date('2026-08-24T00:00:00.000Z') }))
        .mockResolvedValueOnce(mockDocument({ date: new Date('2026-08-23T00:00:00.000Z') }));

      const result = await service.getStreak('user-1', 'UTC');

      expect(result.qualifiedDays).toBe(3);
      expect(result.lastActivityDate).toBeDefined();
    });
  });

  describe('getStreakHistory', () => {
    it('should return streak history', async () => {
      const records = [
        mockDocument({ date: new Date('2026-08-25T00:00:00.000Z') }),
        mockDocument({ date: new Date('2026-08-24T00:00:00.000Z') }),
      ];

      model.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(records),
          }),
        }),
      });

      const result = await service.getStreakHistory('user-1', 30);

      expect(result).toHaveLength(2);
    });
  });
});
