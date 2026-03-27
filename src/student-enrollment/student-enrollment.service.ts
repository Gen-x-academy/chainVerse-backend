import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Enrollment, EnrollmentDocument } from './schemas/enrollment.schema';
import { Course, CourseDocument } from '../admin-course/schemas/course.schema';
import {
  CartItem,
  CartItemDocument,
} from '../student-cart/schemas/cart-item.schema';
import { DomainEvents } from '../events/event-names';

@Injectable()
export class StudentEnrollmentService {
  constructor(
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async enrollFree(studentId: string, courseId: string): Promise<Enrollment> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.status !== 'published') {
      throw new BadRequestException('Course is not available for enrollment');
    }

    if (course.price > 0) {
      throw new BadRequestException(
        'This course is not free. Please use checkout.',
      );
    }

    // Check if already enrolled
    const existing = await this.enrollmentModel
      .findOne({ studentId, courseId })
      .exec();
    if (existing) {
      throw new ConflictException('Already enrolled in this course');
    }

    const enrollment = new this.enrollmentModel({
      studentId,
      courseId,
      type: 'free',
      amountPaid: 0,
      status: 'completed',
    });

    const savedEnrollment = await enrollment.save();

    // Update course's enrolled students and total enrollments
    await this.courseModel
      .findByIdAndUpdate(courseId, {
        $addToSet: { enrolledStudents: studentId },
        $inc: { totalEnrollments: 1 },
      })
      .exec();

    // Emit enrollment event
    this.eventEmitter.emit(DomainEvents.STUDENT_ENROLLED, {
      studentId,
      courseId,
      tutorId: course.tutorId,
      tutorEmail: course.tutorEmail,
    });

    return savedEnrollment;
  }

  async checkoutCart(
    studentId: string,
    paymentMethod?: string,
  ): Promise<{ enrolled: string[]; failed: string[]; totalAmount: number }> {
    const cartItems = await this.cartItemModel.find({ studentId }).exec();
    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const enrolled: string[] = [];
    const failed: string[] = [];
    let totalAmount = 0;

    for (const item of cartItems) {
      try {
        const course = await this.courseModel.findById(item.courseId).exec();
        if (!course) {
          failed.push(item.courseId);
          continue;
        }

        if (course.status !== 'published') {
          failed.push(item.courseId);
          await this.cartItemModel.findByIdAndDelete(item._id).exec();
          continue;
        }

        // Check if already enrolled
        const existing = await this.enrollmentModel
          .findOne({ studentId, courseId: item.courseId })
          .exec();
        if (existing) {
          // If already enrolled, just skip and remove from cart
          await this.cartItemModel.findByIdAndDelete(item._id).exec();
          continue;
        }

        const enrollment = new this.enrollmentModel({
          studentId,
          courseId: item.courseId,
          type: course.price > 0 ? 'paid' : 'free',
          amountPaid: course.price,
          status: 'completed',
          paymentMethod,
        });

        await enrollment.save();

        // Update course's enrolled students and total enrollments
        await this.courseModel
          .findByIdAndUpdate(item.courseId, {
            $addToSet: { enrolledStudents: studentId },
            $inc: { totalEnrollments: 1 },
          })
          .exec();

        // Remove from cart
        await this.cartItemModel.findByIdAndDelete(item._id).exec();
        enrolled.push(item.courseId);
        totalAmount += course.price;

        // Emit enrollment event
        this.eventEmitter.emit(DomainEvents.STUDENT_ENROLLED, {
          studentId,
          courseId: item.courseId,
          tutorId: course.tutorId,
          tutorEmail: course.tutorEmail,
          amountPaid: course.price,
        });
      } catch (error) {
        failed.push(item.courseId);
      }
    }

    return { enrolled, failed, totalAmount };
  }

  async getMyCourses(studentId: string): Promise<
    Array<{
      enrollment: EnrollmentDocument;
      course: {
        id: string;
        title: string;
        description: string;
        thumbnailUrl: string;
        tutorName: string;
        progress?: number;
      };
    }>
  > {
    const enrollments = await this.enrollmentModel.find({ studentId }).exec();

    const coursesWithEnrollment = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = await this.courseModel
          .findById(enrollment.courseId)
          .exec();
        if (!course) {
          return null;
        }
        return {
          enrollment,
          course: {
            id: course.id,
            title: course.title,
            description: course.description,
            thumbnailUrl: course.thumbnailUrl,
            tutorName: course.tutorName,
            progress: 0, // TODO: Implement progress tracking
          },
        };
      }),
    );

    return coursesWithEnrollment.filter((c) => c !== null) as Array<{
      enrollment: EnrollmentDocument;
      course: {
        id: string;
        title: string;
        description: string;
        thumbnailUrl: string;
        tutorName: string;
        progress?: number;
      };
    }>;
  }

  async isEnrolled(studentId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.enrollmentModel
      .findOne({ studentId, courseId })
      .exec();
    return !!enrollment;
  }

  async getEnrollmentStats(courseId: string): Promise<{
    totalEnrollments: number;
    recentEnrollments: number;
  }> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentEnrollments = await this.enrollmentModel
      .countDocuments({
        courseId,
        createdAt: { $gte: thirtyDaysAgo },
      })
      .exec();

    return {
      totalEnrollments: course.totalEnrollments,
      recentEnrollments,
    };
  }

  async getStudentEnrollmentCount(studentId: string): Promise<number> {
    return this.enrollmentModel.countDocuments({ studentId }).exec();
  }
}
