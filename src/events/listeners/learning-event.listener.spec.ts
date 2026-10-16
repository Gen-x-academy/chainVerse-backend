
import { Test, TestingModule } from '@nestjs/testing';
import { LearningEventListener } from './learning-event.listener';
import { AnalyticsIngestionService } from '../../course-analytics/analytics-ingestion.service';
import { DomainEvents } from '../event-names';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';

describe('LearningEventListener', () => {
  let listener: LearningEventListener;
  let analyticsIngestionService: AnalyticsIngestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningEventListener,
        {
          provide: AnalyticsIngestionService,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get<LearningEventListener>(LearningEventListener);
    analyticsIngestionService = module.get<AnalyticsIngestionService>(
      AnalyticsIngestionService,
    );
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('onStudentEnrolled', () => {
    it('should call the analytics ingestion service with the correct data', async () => {
      const payload: StudentEnrolledPayload = {
        studentId: 'student-123',
        courseId: 'course-456',
      };

      await listener.onStudentEnrolled(payload);

      expect(analyticsIngestionService.create).toHaveBeenCalledWith({
        eventId: expect.any(String),
        eventName: DomainEvents.STUDENT_ENROLLED,
        schemaVersion: 1,
        payload: {
          studentId: 'student-123',
          courseId: 'course-456',
        },
      });
    });
  });
});