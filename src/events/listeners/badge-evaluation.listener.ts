import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents } from '../event-names';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';
import { CourseCompletedPayload } from '../payloads/course-completed.payload';
import { QuizPassedPayload } from '../payloads/quiz-passed.payload';
import { HoursLoggedPayload } from '../payloads/hours-logged.payload';
import { BadgeService } from '../../badge/badge.service';
import { PointsService } from '../../points/points.service';

@Injectable()
export class BadgeEvaluationListener {
  private readonly logger = new Logger(BadgeEvaluationListener.name);

  constructor(
    private readonly badgeService: BadgeService,
    private readonly pointsService: PointsService,
  ) {}

  @OnEvent(DomainEvents.CERTIFICATE_ISSUED)
  async onCertificateIssued(payload: CertificateIssuedPayload): Promise<void> {
    const summary = await this.pointsService.getUserPoints(payload.studentId);
    const coursesCompleted = summary.records.filter(
      (r) => r.activityType === 'certificate_earned',
    ).length;

    await this.badgeService.evaluateAndAward(
      payload.studentId,
      DomainEvents.CERTIFICATE_ISSUED,
      { coursesCompleted },
    );
  }

  @OnEvent(DomainEvents.COURSE_COMPLETED)
  async onCourseCompleted(payload: CourseCompletedPayload): Promise<void> {
    const summary = await this.pointsService.getUserPoints(payload.studentId);
    const coursesCompleted = summary.records.filter(
      (r) => r.activityType === 'certificate_earned',
    ).length + 1;

    await this.badgeService.evaluateAndAward(
      payload.studentId,
      DomainEvents.COURSE_COMPLETED,
      { coursesCompleted },
    );
  }

  @OnEvent(DomainEvents.QUIZ_PASSED)
  async onQuizPassed(payload: QuizPassedPayload): Promise<void> {
    const summary = await this.pointsService.getUserPoints(payload.studentId);
    const quizzesPassed = summary.records.filter(
      (r) => r.activityType === 'quiz_passed',
    ).length + 1;

    await this.badgeService.evaluateAndAward(
      payload.studentId,
      DomainEvents.QUIZ_PASSED,
      { quizzesPassed, lastQuizScore: payload.score },
    );
  }

  @OnEvent(DomainEvents.HOURS_LOGGED)
  async onHoursLogged(payload: HoursLoggedPayload): Promise<void> {
    const summary = await this.pointsService.getUserPoints(payload.studentId);
    const totalHours = summary.records
      .filter((r) => r.activityType === 'hours_logged')
      .reduce((sum, r) => sum + ((r.metadata?.hours as number) ?? 0), 0) + payload.hours;

    await this.badgeService.evaluateAndAward(
      payload.studentId,
      DomainEvents.HOURS_LOGGED,
      { totalHours },
    );
  }
}
