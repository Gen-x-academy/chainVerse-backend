import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course } from '../../admin-course/schemas/course.schema';

/**
 * Guard to verify that the authenticated user owns the course.
 * Expects a route parameter named 'id' (course ID).
 * The user's ID should be available via req.user.sub or req.user.id.
 */
@Injectable()
export class CourseOwnershipGuard implements CanActivate {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const courseId = request.params.id;

    if (!courseId) {
      throw new NotFoundException('Course ID not found in route parameters');
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userId = user.sub || user.id;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if user owns the course
    if (course.tutorId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this course',
      );
    }

    // Attach course to request for use in handler
    request.course = course;

    return true;
  }
}
