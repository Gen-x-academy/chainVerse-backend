import { Injectable } from '@nestjs/common';

@Injectable()
export class ReportsService {
  getTutorReport(tutorId: string) {
    return {
      tutorId,
      totalCourses: 12,
      totalStudents: 246,
      averageRating: 4.9,
      monthlyActiveStudents: 148,
      completedLessons: 1840,
      reportGeneratedAt: new Date().toISOString(),
    };
  }
}
