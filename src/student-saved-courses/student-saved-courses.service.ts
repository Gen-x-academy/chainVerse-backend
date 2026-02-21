import { Injectable } from '@nestjs/common';

@Injectable()
export class StudentSavedCoursesService {
  private readonly saved = new Map<string, Set<string>>();

  add(studentId: string, courseId: string) {
    if (!this.saved.has(studentId)) {
      this.saved.set(studentId, new Set());
    }
    this.saved.get(studentId)?.add(courseId);
    return { studentId, courses: [...(this.saved.get(studentId) ?? [])] };
  }

  list(studentId: string) {
    return { studentId, courses: [...(this.saved.get(studentId) ?? [])] };
  }

  remove(studentId: string, courseId: string) {
    this.saved.get(studentId)?.delete(courseId);
    return { studentId, courses: [...(this.saved.get(studentId) ?? [])] };
  }
}
