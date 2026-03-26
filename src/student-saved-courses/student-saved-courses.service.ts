import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SavedCourse, SavedCourseDocument } from './schemas/saved-course.schema';

@Injectable()
export class StudentSavedCoursesService {
  constructor(
    @InjectModel(SavedCourse.name)
    private readonly savedCourseModel: Model<SavedCourseDocument>,
  ) {}

  async add(
    studentId: string,
    courseId: string,
  ): Promise<{ studentId: string; courses: string[] }> {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    const existing = await this.savedCourseModel
      .findOne({ studentId, courseId })
      .exec();
    if (existing) {
      throw new ConflictException('Course is already saved');
    }

    await new this.savedCourseModel({ studentId, courseId }).save();

    const saved = await this.savedCourseModel.find({ studentId }).exec();
    return { studentId, courses: saved.map((s) => s.courseId) };
  }

  async list(
    studentId: string,
  ): Promise<{ studentId: string; courses: string[] }> {
    if (!studentId) {
      throw new BadRequestException('Invalid student ID');
    }

    const saved = await this.savedCourseModel.find({ studentId }).exec();
    return { studentId, courses: saved.map((s) => s.courseId) };
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
    const result = await this.savedCourseModel
      .findOneAndDelete({ studentId, courseId })
      .exec();
    if (!result) {
      throw new NotFoundException('Saved course not found');
    }

    const remaining = await this.savedCourseModel.find({ studentId }).exec();
    return {
      studentId,
      courseId,
      message: 'Course removed from saved list',
      courses: remaining.map((s) => s.courseId),
    };
  }
}
