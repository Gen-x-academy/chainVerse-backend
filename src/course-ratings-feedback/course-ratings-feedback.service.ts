import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCourseRatingsFeedbackDto } from './dto/create-course-ratings-feedback.dto';
import { UpdateCourseRatingsFeedbackDto } from './dto/update-course-ratings-feedback.dto';
import {
  CourseRating,
  CourseRatingDocument,
} from './schemas/course-rating.schema';
import { Course } from '../admin-course/schemas/course.schema';
import {
  Enrollment,
  EnrollmentDocument,
} from '../student-enrollment/schemas/enrollment.schema';

@Injectable()
export class CourseRatingsFeedbackService {
  constructor(
    @InjectModel(CourseRating.name)
    private readonly ratingModel: Model<CourseRatingDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
  ) {}

  async create(
    courseId: string,
    studentId: string,
    payload: CreateCourseRatingsFeedbackDto,
  ): Promise<CourseRating> {
    if (payload.rating < 1 || payload.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if student is enrolled
    const enrollment = await this.enrollmentModel
      .findOne({ courseId, studentId })
      .exec();
    if (!enrollment) {
      throw new BadRequestException(
        'You can only rate courses you are enrolled in',
      );
    }

    const existing = await this.ratingModel
      .findOne({ courseId, studentId })
      .exec();
    if (existing) {
      throw new ConflictException(
        'You have already rated this course. Use PUT to update your rating.',
      );
    }

    const rating = new this.ratingModel({ courseId, studentId, ...payload });
    await rating.save();

    // Update course statistics
    await this.updateCourseStats(courseId);

    return rating;
  }

  async findAllForCourse(courseId: string): Promise<{
    ratings: CourseRating[];
    averageRating: number;
    totalRatings: number;
  }> {
    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const ratings = await this.ratingModel.find({ courseId }).exec();
    const totalRatings = ratings.length;
    const averageRating =
      totalRatings > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : 0;

    return {
      ratings,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
    };
  }

  async findByStudentAndCourse(
    studentId: string,
    courseId: string,
  ): Promise<CourseRatingDocument> {
    const rating = await this.ratingModel
      .findOne({ studentId, courseId })
      .exec();
    if (!rating) {
      throw new NotFoundException('Rating not found for this course');
    }
    return rating;
  }

  async update(
    courseId: string,
    studentId: string,
    payload: UpdateCourseRatingsFeedbackDto,
  ): Promise<CourseRating> {
    if (
      payload.rating !== undefined &&
      (payload.rating < 1 || payload.rating > 5)
    ) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const rating = await this.ratingModel
      .findOneAndUpdate({ courseId, studentId }, payload, { new: true })
      .exec();
    if (!rating) {
      throw new NotFoundException('Rating not found for this course');
    }

    // Update course statistics
    await this.updateCourseStats(courseId);

    return rating;
  }

  async remove(
    courseId: string,
    studentId: string,
  ): Promise<{ courseId: string; studentId: string; deleted: boolean }> {
    const result = await this.ratingModel
      .findOneAndDelete({ courseId, studentId })
      .exec();
    if (!result) {
      throw new NotFoundException('Rating not found for this course');
    }

    // Update course statistics
    await this.updateCourseStats(courseId);

    return { courseId, studentId, deleted: true };
  }

  /**
   * Update course rating statistics
   */
  private async updateCourseStats(courseId: string): Promise<void> {
    const ratings = await this.ratingModel.find({ courseId }).exec();
    const totalRatings = ratings.length;
    const averageRating =
      totalRatings > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : 0;

    await this.courseModel
      .findByIdAndUpdate(courseId, {
        totalReviews: totalRatings,
        averageRating: Math.round(averageRating * 100) / 100,
      })
      .exec();
  }
}
