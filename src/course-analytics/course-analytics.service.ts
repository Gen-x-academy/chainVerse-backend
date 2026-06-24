import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course } from '../admin-course/schemas/course.schema';
import { Enrollment } from '../student-enrollment/schemas/enrollment.schema';
import { CourseRating } from '../course-ratings-feedback/schemas/course-rating.schema';
import { SavedCourse } from '../student-saved-courses/schemas/saved-course.schema';
import { CartItem } from '../student-cart/schemas/cart-item.schema';

export interface CourseAnalytics {
  courseId: string;
  title: string;
  tutorId: string;
  tutorName: string;
  status: string;
  overview: {
    totalEnrollments: number;
    totalRevenue: number;
    totalReviews: number;
    averageRating: number;
    totalWishlists: number;
    totalCarts: number;
    viewCount: number;
  };
  enrollmentStats: {
    total: number;
    last7Days: number;
    last30Days: number;
    trend: 'up' | 'down' | 'stable';
  };
  revenueStats: {
    total: number;
    last7Days: number;
    last30Days: number;
    averagePerEnrollment: number;
  };
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  recentReviews: Array<{
    studentId: string;
    rating: number;
    feedback?: string;
    createdAt: Date;
  }>;
  studentDemographics: {
    newStudents: number;
    returningStudents: number;
  };
}

export interface TutorAnalytics {
  tutorId: string;
  tutorName: string;
  tutorEmail: string;
  overview: {
    totalCourses: number;
    totalStudents: number;
    totalRevenue: number;
    averageRating: number;
    totalReviews: number;
  };
  coursesPerformance: Array<{
    courseId: string;
    title: string;
    enrollments: number;
    revenue: number;
    rating: number;
    status: string;
  }>;
  recentEnrollments: Array<{
    courseId: string;
    courseTitle: string;
    studentId: string;
    enrolledAt: Date;
    amount: number;
  }>;
  earningsOverTime: Array<{
    period: string;
    amount: number;
  }>;
}

@Injectable()
export class CourseAnalyticsService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(CourseRating.name)
    private readonly ratingModel: Model<CourseRating>,
    @InjectModel(SavedCourse.name)
    private readonly savedCourseModel: Model<SavedCourse>,
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItem>,
  ) {}

  /**
   * Get comprehensive analytics for a single course
   */
  async getCourseAnalytics(courseId: string): Promise<CourseAnalytics> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get enrollment stats
    const [totalEnrollments, last7DaysEnrollments, last30DaysEnrollments] =
      await Promise.all([
        this.enrollmentModel.countDocuments({ courseId }).exec(),
        this.enrollmentModel
          .countDocuments({ courseId, createdAt: { $gte: sevenDaysAgo } })
          .exec(),
        this.enrollmentModel
          .countDocuments({ courseId, createdAt: { $gte: thirtyDaysAgo } })
          .exec(),
      ]);

    // Get revenue stats
    const [totalRevenue, last7DaysRevenue, last30DaysRevenue] =
      await Promise.all([
        this.getRevenueForCourse(courseId),
        this.getRevenueForCourse(courseId, sevenDaysAgo),
        this.getRevenueForCourse(courseId, thirtyDaysAgo),
      ]);

    // Get rating distribution
    const ratings = await this.ratingModel.find({ courseId }).exec();
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings.forEach((r) => {
      ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
    });

    // Get recent reviews
    const recentReviews = await this.ratingModel
      .find({ courseId })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    // Calculate enrollment trend
    const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const previous30DaysEnrollments = await this.enrollmentModel
      .countDocuments({
        courseId,
        createdAt: { $gte: previous30Days, $lt: thirtyDaysAgo },
      })
      .exec();

    const trend = this.calculateTrend(
      last30DaysEnrollments,
      previous30DaysEnrollments,
    );

    // Get wishlist and cart counts
    const [totalWishlists, totalCarts] = await Promise.all([
      this.savedCourseModel.countDocuments({ courseId }).exec(),
      this.cartItemModel.countDocuments({ courseId }).exec(),
    ]);

    return {
      courseId: course.id,
      title: course.title,
      tutorId: course.tutorId,
      tutorName: course.tutorName,
      status: course.status,
      overview: {
        totalEnrollments: course.totalEnrollments,
        totalRevenue,
        totalReviews: course.totalReviews,
        averageRating: course.averageRating,
        totalWishlists,
        totalCarts,
        viewCount: course.viewCount,
      },
      enrollmentStats: {
        total: totalEnrollments,
        last7Days: last7DaysEnrollments,
        last30Days: last30DaysEnrollments,
        trend,
      },
      revenueStats: {
        total: totalRevenue,
        last7Days: last7DaysRevenue,
        last30Days: last30DaysRevenue,
        averagePerEnrollment:
          totalEnrollments > 0
            ? Math.round((totalRevenue / totalEnrollments) * 100) / 100
            : 0,
      },
      ratingDistribution,
      recentReviews: recentReviews.map((r) => ({
        studentId: r.studentId,
        rating: r.rating,
        feedback: r.feedback,
        createdAt: r.createdAt,
      })),
      studentDemographics: {
        newStudents: last30DaysEnrollments,
        returningStudents: totalEnrollments - last30DaysEnrollments,
      },
    };
  }

  /**
   * Get analytics for all courses by a tutor
   */
  async getTutorAnalytics(tutorId: string): Promise<TutorAnalytics> {
    const courses = await this.courseModel.find({ tutorId }).exec();
    if (!courses.length) {
      throw new NotFoundException('No courses found for this tutor');
    }

    const tutorName = courses[0].tutorName;
    const tutorEmail = courses[0].tutorEmail;

    // Get course performance data
    const coursesPerformance = await Promise.all(
      courses.map(async (course) => {
        const enrollments = await this.enrollmentModel
          .countDocuments({ courseId: course.id })
          .exec();
        const revenue = await this.getRevenueForCourse(course.id);
        return {
          courseId: course.id,
          title: course.title,
          enrollments,
          revenue,
          rating: course.averageRating,
          status: course.status,
        };
      }),
    );

    // Calculate totals
    const totalStudents = await this.enrollmentModel
      .distinct('studentId', {
        courseId: { $in: courses.map((c) => c.id) },
      })
      .then((ids) => ids.length);

    const totalRevenue = coursesPerformance.reduce(
      (sum, c) => sum + c.revenue,
      0,
    );
    const totalReviews = courses.reduce((sum, c) => sum + c.totalReviews, 0);
    const avgRating =
      courses.length > 0
        ? courses.reduce((sum, c) => sum + c.averageRating, 0) / courses.length
        : 0;

    // Get recent enrollments across all courses
    const recentEnrollments = await this.enrollmentModel
      .find({ courseId: { $in: courses.map((c) => c.id) } })
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    const recentEnrollmentsWithDetails = await Promise.all(
      recentEnrollments.map(async (enrollment) => {
        const course = courses.find((c) => c.id === enrollment.courseId);
        return {
          courseId: enrollment.courseId,
          courseTitle: course?.title || 'Unknown',
          studentId: enrollment.studentId,
          enrolledAt: enrollment.createdAt,
          amount: enrollment.amountPaid,
        };
      }),
    );

    // Get earnings over time (last 6 months)
    const earningsOverTime = await this.getEarningsOverTime(
      courses.map((c) => c.id),
    );

    return {
      tutorId,
      tutorName,
      tutorEmail,
      overview: {
        totalCourses: courses.length,
        totalStudents,
        totalRevenue,
        averageRating: Math.round(avgRating * 100) / 100,
        totalReviews,
      },
      coursesPerformance,
      recentEnrollments: recentEnrollmentsWithDetails,
      earningsOverTime,
    };
  }

  /**
   * Get platform-wide course analytics (admin view)
   */
  async getPlatformAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCourses,
      publishedCourses,
      totalEnrollments,
      totalRevenue,
      totalStudents,
    ] = await Promise.all([
      this.courseModel.countDocuments().exec(),
      this.courseModel
        .countDocuments({ status: 'published', deletedAt: null })
        .exec(),
      this.enrollmentModel.countDocuments().exec(),
      this.getTotalPlatformRevenue(),
      this.enrollmentModel.distinct('studentId').then((ids) => ids.length),
    ]);

    const recentEnrollments = await this.enrollmentModel
      .countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
      })
      .exec();

    // Get top courses by enrollment
    const topCourses = await this.courseModel
      .find({ status: 'published', deletedAt: null })
      .sort({ totalEnrollments: -1 })
      .limit(10)
      .exec();

    // Get top tutors by revenue
    const topTutors = await this.courseModel.aggregate([
      { $match: { status: 'published', deletedAt: null } },
      {
        $group: {
          _id: '$tutorId',
          tutorName: { $first: '$tutorName' },
          totalRevenue: { $sum: '$price' },
          totalCourses: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    // Get category distribution
    const categoryDistribution = await this.courseModel.aggregate([
      { $match: { status: 'published', deletedAt: null } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalEnrollments: { $sum: '$totalEnrollments' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return {
      overview: {
        totalCourses,
        publishedCourses,
        totalEnrollments,
        totalRevenue,
        totalStudents,
        recentEnrollments,
      },
      topCourses: topCourses.map((c) => ({
        id: c.id,
        title: c.title,
        tutorName: c.tutorName,
        enrollments: c.totalEnrollments,
        revenue: c.price * c.totalEnrollments,
        rating: c.averageRating,
      })),
      topTutors: topTutors.map((t) => ({
        tutorId: t._id,
        tutorName: t.tutorName,
        totalCourses: t.totalCourses,
        estimatedRevenue: t.totalRevenue,
      })),
      categoryDistribution: categoryDistribution.map((c) => ({
        category: c._id,
        courseCount: c.count,
        totalEnrollments: c.totalEnrollments,
      })),
    };
  }

  private async getRevenueForCourse(
    courseId: string,
    since?: Date,
  ): Promise<number> {
    const query: Record<string, unknown> = { courseId };
    if (since) {
      query.createdAt = { $gte: since };
    }

    const enrollments = await this.enrollmentModel.find(query).exec();
    return enrollments.reduce((sum, e) => sum + e.amountPaid, 0);
  }

  private async getTotalPlatformRevenue(): Promise<number> {
    const enrollments = await this.enrollmentModel
      .find({ type: 'paid' })
      .exec();
    return enrollments.reduce((sum, e) => sum + e.amountPaid, 0);
  }

  private calculateTrend(
    current: number,
    previous: number,
  ): 'up' | 'down' | 'stable' {
    if (previous === 0) return current > 0 ? 'up' : 'stable';
    const change = (current - previous) / previous;
    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }

  private async getEarningsOverTime(
    courseIds: string[],
  ): Promise<Array<{ period: string; amount: number }>> {
    const now = new Date();
    const periods = [];

    for (let i = 5; i >= 0; i--) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const enrollments = await this.enrollmentModel
        .find({
          courseId: { $in: courseIds },
          createdAt: { $gte: startDate, $lte: endDate },
          type: 'paid',
        })
        .exec();

      const amount = enrollments.reduce((sum, e) => sum + e.amountPaid, 0);
      periods.push({
        period: startDate.toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        amount,
      });
    }

    return periods;
  }
}
