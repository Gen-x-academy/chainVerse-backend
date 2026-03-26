import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PointsService } from '../../points/points.service';
import { DomainEvents } from '../event-names';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';

/**
 * Listens to domain events and awards gamification points.
 * The points module never needs to know about enrollment or certificates directly.
 */
@Injectable()
export class PointsListener {
  constructor(private readonly pointsService: PointsService) {}

  @OnEvent(DomainEvents.STUDENT_ENROLLED)
  onStudentEnrolled(payload: StudentEnrolledPayload): void {
    this.pointsService.awardPoints({
      userId: payload.studentId,
      points: 10,
      reason: `Enrolled in course ${payload.courseId}`,
      activityType: 'course_enrollment',
      metadata: { courseId: payload.courseId },
    });
  }

  @OnEvent(DomainEvents.CERTIFICATE_ISSUED)
  onCertificateIssued(payload: CertificateIssuedPayload): void {
    this.pointsService.awardPoints({
      userId: payload.studentId,
      points: 100,
      reason: `Completed course: ${payload.courseTitle}`,
      activityType: 'certificate_earned',
      metadata: { certificateId: payload.certificateId },
    });
  }
}
