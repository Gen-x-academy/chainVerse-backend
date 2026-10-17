import { NotFoundException } from '@nestjs/common';
import { CourseAnalyticsService } from './course-analytics.service';

describe('CourseAnalyticsService', () => {
  let service: CourseAnalyticsService;
  let courseModel: any;
  let enrollmentModel: any;
  let ratingModel: any;
  let savedCourseModel: any;
  let cartItemModel: any;

  const course = {
    id: 'course-1',
    title: 'Intro to Stellar',
    tutorId: 'tutor-1',
    tutorName: 'Ada',
    tutorEmail: 'ada@example.com',
    status: 'published',
    totalEnrollments: 4,
    totalRevenue: 400,
    totalReviews: 2,
    averageRating: 4.5,
    viewCount: 100,
  };

  const executable = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  const findStub = (docs: unknown[]) => ({
    exec: jest.fn().mockResolvedValue(docs),
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(docs),
      }),
    }),
  });

  beforeEach(() => {
    courseModel = {
      findById: jest.fn().mockReturnValue(executable(course)),
      find: jest.fn().mockReturnValue(findStub([])),
      countDocuments: jest.fn().mockReturnValue(executable(0)),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    enrollmentModel = {
      countDocuments: jest.fn().mockReturnValue(executable(0)),
      find: jest.fn().mockReturnValue(findStub([])),
      distinct: jest.fn().mockResolvedValue([]),
    };
    ratingModel = {
      find: jest.fn().mockReturnValue(findStub([])),
    };
    savedCourseModel = {
      countDocuments: jest.fn().mockReturnValue(executable(0)),
    };
    cartItemModel = {
      countDocuments: jest.fn().mockReturnValue(executable(0)),
    };

    service = new CourseAnalyticsService(
      courseModel,
      enrollmentModel,
      ratingModel,
      savedCourseModel,
      cartItemModel,
    );
  });

  it('throws NotFoundException when the course does not exist', async () => {
    courseModel.findById.mockReturnValue(executable(null));

    await expect(service.getCourseAnalytics('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns course analytics with zeroed counters when there is no activity', async () => {
    const result = await service.getCourseAnalytics('course-1');

    expect(result.courseId).toBe('course-1');
    expect(result.overview).toMatchObject({
      totalEnrollments: 4,
      totalRevenue: 0,
      totalWishlists: 0,
      totalCarts: 0,
    });
    expect(result.enrollmentStats).toEqual({
      total: 0,
      last7Days: 0,
      last30Days: 0,
      trend: 'stable',
    });
    expect(result.ratingDistribution).toEqual({
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    });
  });

  it('throws NotFoundException when a tutor has no courses', async () => {
    courseModel.find.mockReturnValue(findStub([]));

    await expect(
      service.getTutorAnalytics('missing-tutor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aggregates tutor analytics across their courses', async () => {
    courseModel.find.mockReturnValue(findStub([course]));

    const result = await service.getTutorAnalytics('tutor-1');

    expect(result).toMatchObject({
      tutorId: 'tutor-1',
      tutorName: 'Ada',
      tutorEmail: 'ada@example.com',
    });
    expect(result.overview.totalCourses).toBe(1);
    expect(result.coursesPerformance).toHaveLength(1);
    expect(result.earningsOverTime).toHaveLength(6);
  });

  it('returns platform-wide analytics', async () => {
    courseModel.countDocuments.mockReturnValue(executable(3));
    courseModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue(executable([])),
      }),
    });

    const result = await service.getPlatformAnalytics();

    expect(result.overview).toMatchObject({
      totalCourses: 3,
      totalRevenue: 0,
      totalStudents: 0,
    });
    expect(result.topCourses).toEqual([]);
    expect(result.topTutors).toEqual([]);
  });
});
