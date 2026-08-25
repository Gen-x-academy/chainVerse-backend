import { Test, TestingModule } from '@nestjs/testing';
import { StreakListener } from './streak.listener';
import { StreakService } from '../../session/streak.service';
import { DomainEvents } from '../event-names';
import { LearningActivityPayload } from '../payloads/learning-activity.payload';

describe('StreakListener', () => {
  let listener: StreakListener;
  let streakService: StreakService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakListener,
        {
          provide: StreakService,
          useValue: {
            recordActivity: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get<StreakListener>(StreakListener);
    streakService = module.get<StreakService>(StreakService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('onLearningActivity', () => {
    it('should call streak service with correct data', async () => {
      const payload: LearningActivityPayload = {
        userId: 'student-123',
        timezone: 'America/New_York',
        activityType: 'course_enrollment',
        metadata: { courseId: 'course-456' },
      };

      await listener.onLearningActivity(payload);

      expect(streakService.recordActivity).toHaveBeenCalledWith(
        'student-123',
        'America/New_York',
      );
    });

    it('should default to UTC timezone when not provided', async () => {
      const payload: LearningActivityPayload = {
        userId: 'student-123',
        activityType: 'lesson_completed',
      };

      await listener.onLearningActivity(payload);

      expect(streakService.recordActivity).toHaveBeenCalledWith(
        'student-123',
        'UTC',
      );
    });
  });
});
