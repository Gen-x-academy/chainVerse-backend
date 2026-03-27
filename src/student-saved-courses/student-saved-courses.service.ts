import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SavedCourse,
  SavedCourseDocument,
} from './schemas/saved-course.schema';
import { Course } from '../admin-course/schemas/course.schema';
import { DomainEvents } from '../events/event-names';
import { StudentEnrolledPayload } from '../events/payloads/student-enrolled.payload';

@Injectable()
export class StudentSavedCoursesService {
  constructor(
    @InjectModel(SavedCourse.name)
    private readonly savedCourseModel: Model<SavedCourseDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async add(
    studentId: string,
    courseId: string,
  ): Promise<{ studentId: string; courses: string[] }> {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const existing = await this.savedCourseModel
      .findOne({ studentId, courseId })
      .exec();
    if (existing) {
      throw new ConflictException('Course is already saved');
    }

    await new this.savedCourseModel({ studentId, courseId }).save();

    // Update course wishlist count
    await this.courseModel
      .findByIdAndUpdate(courseId, {
        $inc: { totalWishlists: 1 },
      })
      .exec();

    this.eventEmitter.emit(
      DomainEvents.STUDENT_ENROLLED,
      Object.assign(new StudentEnrolledPayload(), { studentId, courseId }),
    );

    const saved = await this.savedCourseModel.find({ studentId }).exec();
    return { studentId, courses: saved.map((s) => s.courseId) };
  }

  async list(
    studentId: string,
  ): Promise<{
    studentId: string;
    courses: Array<{ courseId: string; course: unknown }>;
  }> {
    if (!studentId) {
      throw new BadRequestException('Invalid student ID');
    }

    const saved = await this.savedCourseModel.find({ studentId }).exec();

    // Fetch course details for each saved course
    const coursesWithDetails = await Promise.all(
      saved.map(async (s) => {
        const course = await this.courseModel.findById(s.courseId).exec();
        return {
          courseId: s.courseId,
          course: course
            ? {
                id: course.id,
                title: course.title,
                description: course.description,
                price: course.price,
                thumbnailUrl: course.thumbnailUrl,
                tutorName: course.tutorName,
                averageRating: course.averageRating,
                totalReviews: course.totalReviews,
                level: course.level,
              }
            : null,
        };
      }),
    );

    return {
      studentId,
      courses: coursesWithDetails.filter((c) => c.course !== null) as Array<{
        courseId: string;
        course: unknown;
      }>,
    };
  }

  async remove(
    studentId: string,
    courseId: string,
  ): Promise<{
    studentId: string;
    courseId: string;
    message: string;
    courses: string[];
  }> {
    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const result = await this.savedCourseModel
      .findOneAndDelete({ studentId, courseId })
      .exec();
    if (!result) {
      throw new NotFoundException('Saved course not found');
    }

    // Update course wishlist count
    await this.courseModel
      .findByIdAndUpdate(courseId, {
        $inc: { totalWishlists: -1 },
      })
      .exec();

    const remaining = await this.savedCourseModel.find({ studentId }).exec();
    return {
      studentId,
      courseId,
      message: 'Course removed from saved list',
      courses: remaining.map((s) => s.courseId),
    };
  }

  async getCount(studentId: string): Promise<number> {
    return this.savedCourseModel.countDocuments({ studentId }).exec();
  }
}
