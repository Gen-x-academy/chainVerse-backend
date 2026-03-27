import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Enrollment, EnrollmentDocument } from './schemas/enrollment.schema';
import { Course, CourseDocument } from '../admin-course/schemas/course.schema';
import { CartItem, CartItemDocument } from '../student-cart/schemas/cart-item.schema';

@Injectable()
export class StudentEnrollmentService {
  constructor(
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,
  ) {}

  async enrollFree(studentId: string, courseId: string): Promise<Enrollment> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.price > 0) {
      throw new BadRequestException('This course is not free. Please use checkout.');
    }

    // Check if already enrolled
    const existing = await this.enrollmentModel.findOne({ studentId, courseId }).exec();
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

    // Update course's enrolled students
    await this.courseModel.findByIdAndUpdate(courseId, {
      $addToSet: { enrolledStudents: studentId },
    }).exec();

    return savedEnrollment;
  }

  async checkoutCart(studentId: string): Promise<{ enrolled: string[]; failed: string[] }> {
    const cartItems = await this.cartItemModel.find({ studentId }).exec();
    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const enrolled: string[] = [];
    const failed: string[] = [];

    for (const item of cartItems) {
      try {
        const course = await this.courseModel.findById(item.courseId).exec();
        if (!course) {
          failed.push(item.courseId);
          continue;
        }

        // Check if already enrolled
        const existing = await this.enrollmentModel.findOne({ studentId, courseId: item.courseId }).exec();
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
        });

        await enrollment.save();

        // Update course's enrolled students
        await this.courseModel.findByIdAndUpdate(item.courseId, {
          $addToSet: { enrolledStudents: studentId },
        }).exec();

        // Remove from cart
        await this.cartItemModel.findByIdAndDelete(item._id).exec();
        enrolled.push(item.courseId);
      } catch (error) {
        failed.push(item.courseId);
      }
    }

    return { enrolled, failed };
  }

  async getMyCourses(studentId: string): Promise<Course[]> {
    const enrollments = await this.enrollmentModel
      .find({ studentId })
      .populate('courseId')
      .exec();
    
    return enrollments
      .filter(e => e.courseId) // Ensure course still exists
      .map(e => e.courseId as unknown as Course);
  }

  async isEnrolled(studentId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.enrollmentModel.findOne({ studentId, courseId }).exec();
    return !!enrollment;
  }
}
