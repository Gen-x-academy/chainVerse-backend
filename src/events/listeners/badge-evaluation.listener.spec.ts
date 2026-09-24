import { Test, TestingModule } from '@nestjs/testing';
import { BadgeEvaluationListener } from './badge-evaluation.listener';
import { BadgeService } from '../../badge/badge.service';
import { PointsService } from '../../points/points.service';
import { DomainEvents } from '../event-names';

describe('BadgeEvaluationListener', () => {
  let listener: BadgeEvaluationListener;
  let badgeService: jest.Mocked<BadgeService>;
  let pointsService: jest.Mocked<PointsService>;

  const mockUserPointsSummary = {
    userId: 'user-1',
    totalPoints: 200,
    records: [
      { activityType: 'certificate_earned', points: 100, metadata: {} },
      { activityType: 'course_enrollment', points: 10, metadata: {} },
      { activityType: 'quiz_passed', points: 50, metadata: {} },
      { activityType: 'hours_logged', points: 40, metadata: { hours: 4 } },
    ],
  };

  beforeEach(async () => {
    badgeService = {
      evaluateAndAward: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BadgeService>;

    pointsService = {
      getUserPoints: jest.fn().mockResolvedValue(mockUserPointsSummary),
    } as unknown as jest.Mocked<PointsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeEvaluationListener,
        { provide: BadgeService, useValue: badgeService },
        { provide: PointsService, useValue: pointsService },
      ],
    }).compile();

    listener = module.get<BadgeEvaluationListener>(BadgeEvaluationListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('onCertificateIssued', () => {
    it('should evaluate badges with coursesCompleted metric', async () => {
      await listener.onCertificateIssued({
        certificateId: 'cert-1',
        studentId: 'user-1',
        courseTitle: 'Intro to Blockchain',
      });

      expect(pointsService.getUserPoints).toHaveBeenCalledWith('user-1');
      expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(
        'user-1',
        DomainEvents.CERTIFICATE_ISSUED,
        { coursesCompleted: 1 },
      );
    });
  });

  describe('onCourseCompleted', () => {
    it('should evaluate badges with coursesCompleted metric', async () => {
      await listener.onCourseCompleted({
        studentId: 'user-1',
        courseId: 'course-1',
        courseTitle: 'Advanced Solidity',
      });

      expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(
        'user-1',
        DomainEvents.COURSE_COMPLETED,
        { coursesCompleted: 2 },
      );
    });
  });

  describe('onQuizPassed', () => {
    it('should evaluate badges with quizzesPassed metric', async () => {
      await listener.onQuizPassed({
        studentId: 'user-1',
        courseId: 'course-1',
        quizId: 'quiz-1',
        score: 95,
      });

      expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(
        'user-1',
        DomainEvents.QUIZ_PASSED,
        { quizzesPassed: 2, lastQuizScore: 95 },
      );
    });
  });

  describe('onHoursLogged', () => {
    it('should evaluate badges with totalHours metric', async () => {
      await listener.onHoursLogged({
        studentId: 'user-1',
        courseId: 'course-1',
        hours: 2.5,
      });

      expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(
        'user-1',
        DomainEvents.HOURS_LOGGED,
        { totalHours: 6.5 },
      );
    });

    it('should handle zero previous hours', async () => {
      pointsService.getUserPoints.mockResolvedValue({
        userId: 'user-1',
        totalPoints: 0,
        records: [],
      });

      await listener.onHoursLogged({
        studentId: 'user-1',
        courseId: 'course-1',
        hours: 3,
      });

      expect(badgeService.evaluateAndAward).toHaveBeenCalledWith(
        'user-1',
        DomainEvents.HOURS_LOGGED,
        { totalHours: 3 },
      );
    });
  });
});
