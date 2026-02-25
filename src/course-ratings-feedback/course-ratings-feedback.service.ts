import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCourseRatingsFeedbackDto } from './dto/create-course-ratings-feedback.dto';
import { UpdateCourseRatingsFeedbackDto } from './dto/update-course-ratings-feedback.dto';

export interface CourseRating {
  id: string;
  courseId: string;
  studentId: string;
  rating: number;
  feedback?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CourseRatingsFeedbackService {
  private readonly ratings: CourseRating[] = [];

  create(
    courseId: string,
    studentId: string,
    payload: CreateCourseRatingsFeedbackDto,
  ): CourseRating {
    if (payload.rating < 1 || payload.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const existing = this.ratings.find(
      (r) => r.courseId === courseId && r.studentId === studentId,
    );
    if (existing) {
      throw new ConflictException(
        'You have already rated this course. Use PUT to update your rating.',
      );
    }

    const rating: CourseRating = {
      id: crypto.randomUUID(),
      courseId,
      studentId,
      rating: payload.rating,
      feedback: payload.feedback,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.ratings.push(rating);
    return rating;
  }

  findAllForCourse(
    courseId: string,
  ): { ratings: CourseRating[]; averageRating: number; totalRatings: number } {
    const courseRatings = this.ratings.filter((r) => r.courseId === courseId);
    const totalRatings = courseRatings.length;
    const averageRating =
      totalRatings > 0
        ? courseRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : 0;

    return {
      ratings: courseRatings,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
    };
  }

  findByStudentAndCourse(studentId: string, courseId: string): CourseRating {
    const rating = this.ratings.find(
      (r) => r.studentId === studentId && r.courseId === courseId,
    );
    if (!rating) {
      throw new NotFoundException('Rating not found for this course');
    }
    return rating;
  }

  update(
    courseId: string,
    studentId: string,
    payload: UpdateCourseRatingsFeedbackDto,
  ): CourseRating {
    const rating = this.findByStudentAndCourse(studentId, courseId);

    if (payload.rating !== undefined && (payload.rating < 1 || payload.rating > 5)) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    Object.assign(rating, { ...payload, updatedAt: new Date() });
    return rating;
  }

  remove(
    courseId: string,
    studentId: string,
  ): { courseId: string; studentId: string; deleted: boolean } {
    const index = this.ratings.findIndex(
      (r) => r.courseId === courseId && r.studentId === studentId,
    );
    if (index === -1) {
      throw new NotFoundException('Rating not found for this course');
    }
    this.ratings.splice(index, 1);
    return { courseId, studentId, deleted: true };
  }
}
