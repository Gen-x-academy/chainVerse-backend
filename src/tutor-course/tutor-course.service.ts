import { Injectable, ForbiddenException } from '@nestjs/common';
import { AdminCourseService } from '../admin-course/admin-course.service';
import { CreateCourseDto } from '../admin-course/dto/create-course.dto';
import { UpdateCourseDto } from '../admin-course/dto/update-course.dto';

/**
 * TutorCourseService — thin facade over AdminCourseService that enforces
 * tutor-scoped access (a tutor may only manage their own courses).
 */
@Injectable()
export class TutorCourseService {
  constructor(private readonly adminCourseService: AdminCourseService) {}

  findAll(tutorId: string) {
    return this.adminCourseService.findByTutor(tutorId);
  }

  async findOne(id: string, tutorId: string) {
    const course = await this.adminCourseService.findOne(id);
    if (course.tutorId !== tutorId) {
      throw new ForbiddenException('You do not own this course');
    }
    return course;
  }

  create(
    dto: CreateCourseDto,
    tutorId: string,
    tutorEmail: string,
    tutorName: string,
  ) {
    return this.adminCourseService.create(dto, tutorId, tutorEmail, tutorName);
  }

  update(id: string, dto: UpdateCourseDto, tutorId: string) {
    return this.adminCourseService.update(id, dto, tutorId, false);
  }

  submitForReview(id: string, tutorId: string) {
    return this.adminCourseService.submitForReview(id, tutorId);
  }

  publish(id: string, tutorId: string) {
    return this.adminCourseService.publish(id, tutorId, false);
  }

  unpublish(id: string, tutorId: string) {
    return this.adminCourseService.unpublish(id, tutorId, false);
  }

  delete(id: string, tutorId: string, reason?: string) {
    return this.adminCourseService.delete(id, tutorId, false, reason);
  }

  async getEnrollments(id: string, tutorId: string) {
    const course = await this.adminCourseService.findOne(id);
    if (course.tutorId !== tutorId) {
      throw new ForbiddenException('You do not own this course');
    }
    return this.adminCourseService.getEnrollments(id);
  }
}
