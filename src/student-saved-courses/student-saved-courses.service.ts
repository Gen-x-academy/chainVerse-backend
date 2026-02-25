import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class StudentSavedCoursesService {
  private readonly saved = new Map<string, Set<string>>();

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
