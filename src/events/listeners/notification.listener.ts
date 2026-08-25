import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';
import { DomainEvents } from '../event-names';
import { StudentRegisteredPayload } from '../payloads/student-registered.payload';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';
import { FinancialAidApprovedPayload } from '../payloads/financial-aid-approved.payload';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent(DomainEvents.STUDENT_REGISTERED)
  onStudentRegistered(payload: StudentRegisteredPayload): void {
    this.notificationService.create({
      userId: payload.studentId,
      title: 'Welcome to ChainVerse Academy!',
      message: `Hi ${payload.firstName}, your account is ready. Please verify your email to continue.`,
      type: 'welcome',
    });
    this.emailService
      .send(
        payload.email,
        'Welcome to ChainVerse Academy!',
        `Hi ${payload.firstName}, your account is ready. Please verify your email to continue.`,
      )
      .catch(() => {
        /* non-blocking */
      });
  }

  @OnEvent(DomainEvents.STUDENT_ENROLLED)
  onStudentEnrolled(payload: StudentEnrolledPayload): void {
    this.notificationService.create({
      userId: payload.studentId,
      title: 'Enrollment Confirmed',
      message: `You have successfully enrolled in course ${payload.courseId}.`,
      type: 'enrollment',
      metadata: { courseId: payload.courseId },
    });
  }

  @OnEvent(DomainEvents.FINANCIAL_AID_APPROVED)
  onFinancialAidApproved(payload: FinancialAidApprovedPayload): void {
    this.notificationService.create({
      userId: payload.studentId,
      title: 'Financial Aid Approved',
      message: `Your financial aid application for course ${payload.courseId} has been approved.`,
      type: 'financial_aid',
      metadata: {
        applicationId: payload.applicationId,
        courseId: payload.courseId,
      },
    });
  }

  @OnEvent(DomainEvents.CERTIFICATE_ISSUED)
  onCertificateIssued(payload: CertificateIssuedPayload): void {
    this.notificationService.create({
      userId: payload.studentId,
      title: 'Certificate Issued',
      message: `Congratulations! Your certificate for "${payload.courseTitle}" has been issued.`,
      type: 'certificate',
      metadata: { certificateId: payload.certificateId },
    });
  }
}
