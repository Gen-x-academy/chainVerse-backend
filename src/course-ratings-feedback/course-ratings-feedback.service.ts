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

@Injectable()
export class CourseRatingsFeedbackService {
  constructor(
    @InjectModel(CourseRating.name)
    private readonly ratingModel: Model<CourseRatingDocument>,
  ) {}

  async create(
    courseId: string,
    studentId: string,
    payload: CreateCourseRatingsFeedbackDto,
  ): Promise<CourseRating> {
    if (payload.rating < 1 || payload.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
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
    return rating.save();
  }

  async findAllForCourse(courseId: string): Promise<{
    ratings: CourseRating[];
    averageRating: number;
    totalRatings: number;
  }> {
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

    const rating = await this.ratingModel
      .findOneAndUpdate({ courseId, studentId }, payload, { new: true })
      .exec();
    if (!rating) {
      throw new NotFoundException('Rating not found for this course');
    }
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
    return { courseId, studentId, deleted: true };
  }
}
