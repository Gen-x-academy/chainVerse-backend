import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents } from '../events/event-names';
import { StudentEnrolledPayload } from '../events/payloads/student-enrolled.payload';

@Injectable()
export class StudentSavedCoursesService {
  private readonly saved = new Map<string, Set<string>>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  add(studentId: string, courseId: string) {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    if (!this.saved.has(studentId)) {
      this.saved.set(studentId, new Set());
    }

    const studentCourses = this.saved.get(studentId)!;
    if (studentCourses.has(courseId)) {
      throw new ConflictException('Course is already saved');
    }

    studentCourses.add(courseId);

    this.eventEmitter.emit(
      DomainEvents.STUDENT_ENROLLED,
      Object.assign(new StudentEnrolledPayload(), { studentId, courseId }),
    );

    return { studentId, courses: [...studentCourses] };
  }

  list(studentId: string) {
    if (!studentId) {
      throw new BadRequestException('Invalid student ID');
    }

    const courses = [...(this.saved.get(studentId) ?? [])];
    return { studentId, courses };
  }

  remove(studentId: string, courseId: string) {
    const studentCourses = this.saved.get(studentId);
    if (!studentCourses || !studentCourses.has(courseId)) {
      throw new NotFoundException('Saved course not found');
    }

    studentCourses.delete(courseId);
    return {
      studentId,
      courseId,
      message: 'Course removed from saved list',
      courses: [...studentCourses],
    };
  }
}
