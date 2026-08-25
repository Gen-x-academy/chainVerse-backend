
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents } from '../event-names';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';
import { AnalyticsIngestionService } from '../../course-analytics/analytics-ingestion.service';
import { randomUUID } from 'crypto';

@Injectable()
export class LearningEventListener {
  constructor(
    private readonly analyticsIngestionService: AnalyticsIngestionService,
  ) {}

  @OnEvent(DomainEvents.STUDENT_ENROLLED)
  async onStudentEnrolled(payload: StudentEnrolledPayload): Promise<void> {
    await this.analyticsIngestionService.create({
      eventId: randomUUID(),
      eventName: DomainEvents.STUDENT_ENROLLED,
      schemaVersion: 1,
      payload: {
        studentId: payload.studentId,
        courseId: payload.courseId,
      },
    });
  }
}