import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PointsService } from '../../points/points.service';
import { DomainEvents } from '../event-names';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';
import { LedgerEntryEventType } from '../../points/schemas/point-ledger-entry.schema';

/**
 * Listens to domain events and creates append-only ledger entries.
 * Balances are derived from the ledger, never mutated directly.
 */
@Injectable()
export class PointsListener {
  private readonly logger = new Logger(PointsListener.name);

  constructor(private readonly pointsService: PointsService) {}

  @OnEvent(DomainEvents.STUDENT_ENROLLED)
  onStudentEnrolled(payload: StudentEnrolledPayload): void {
    void this.pointsService.createLedgerEntry({
      userId: payload.studentId,
      eventType: LedgerEntryEventType.AWARD,
      amount: 10,
      source: 'course_enrollment',
      idempotencyKey: `${DomainEvents.STUDENT_ENROLLED}:${payload.studentId}:${payload.courseId}`,
      referenceId: payload.courseId,
      metadata: { courseId: payload.courseId },
    });
  }

  @OnEvent(DomainEvents.CERTIFICATE_ISSUED)
  onCertificateIssued(payload: CertificateIssuedPayload): void {
    void this.pointsService.createLedgerEntry({
      userId: payload.studentId,
      eventType: LedgerEntryEventType.AWARD,
      amount: 100,
      source: 'certificate_earned',
      idempotencyKey: `${DomainEvents.CERTIFICATE_ISSUED}:${payload.studentId}:${payload.certificateId}`,
      referenceId: payload.certificateId,
      metadata: { certificateId: payload.certificateId },
    });
  }
}
