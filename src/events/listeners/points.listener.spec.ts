import { Test, TestingModule } from '@nestjs/testing';
import { PointsListener } from './points.listener';
import { PointsService } from '../../points/points.service';
import { DomainEvents } from '../event-names';
import { StudentEnrolledPayload } from '../payloads/student-enrolled.payload';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';
import { LedgerEntryEventType } from '../../points/schemas/point-ledger-entry.schema';

describe('PointsListener', () => {
  let listener: PointsListener;
  let pointsService: PointsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsListener,
        {
          provide: PointsService,
          useValue: {
            createLedgerEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    listener = module.get<PointsListener>(PointsListener);
    pointsService = module.get<PointsService>(PointsService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('onStudentEnrolled', () => {
    it('should create a ledger entry with correct idempotency key', () => {
      const payload: StudentEnrolledPayload = {
        studentId: 'student-123',
        courseId: 'course-456',
      };

      listener.onStudentEnrolled(payload);

      expect(pointsService.createLedgerEntry).toHaveBeenCalledWith({
        userId: 'student-123',
        eventType: LedgerEntryEventType.AWARD,
        amount: 10,
        source: 'course_enrollment',
        idempotencyKey: `${DomainEvents.STUDENT_ENROLLED}:student-123:course-456`,
        referenceId: 'course-456',
        metadata: { courseId: 'course-456' },
      });
    });
  });

  describe('onCertificateIssued', () => {
    it('should create a ledger entry with correct idempotency key', () => {
      const payload: CertificateIssuedPayload = {
        certificateId: 'cert-789',
        studentId: 'student-123',
        courseTitle: 'Intro to NestJS',
      };

      listener.onCertificateIssued(payload);

      expect(pointsService.createLedgerEntry).toHaveBeenCalledWith({
        userId: 'student-123',
        eventType: LedgerEntryEventType.AWARD,
        amount: 100,
        source: 'certificate_earned',
        idempotencyKey: `${DomainEvents.CERTIFICATE_ISSUED}:student-123:cert-789`,
        referenceId: 'cert-789',
        metadata: { certificateId: 'cert-789' },
      });
    });
  });
});
