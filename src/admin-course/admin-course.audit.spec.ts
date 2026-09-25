import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { AdminCourseService } from './admin-course.service';
import { Course } from './schemas/course.schema';
import { Tutor } from '../tutor/schemas/tutor.schema';
import { EmailService } from '../email/email.service';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import { AuditContext } from '../common/audit/audit-context';

const audit: AuditContext = {
  actorId: 'admin-7',
  actorEmail: 'admin@chainverse.io',
  actorRole: 'admin',
  requestId: 'req-course-1',
  ip: '10.0.0.3',
  userAgent: 'jest',
};

const auditService = { record: jest.fn().mockResolvedValue(null) };
const entryFor = (action: AuditAction) =>
  auditService.record.mock.calls
    .map(([entry]) => entry)
    .find((entry) => entry.action === action);

const courseDoc = (over: Record<string, unknown> = {}) => ({
  id: 'course-1',
  title: 'Solidity 101',
  category: 'blockchain',
  price: 100,
  status: 'pending',
  // updateTutorStats casts this to an ObjectId, so it must be a valid one.
  tutorId: '507f1f77bcf86cd799439011',
  tutorEmail: 'tutor@chainverse.io',
  totalEnrollments: 0,
  approvedAt: undefined,
  publishedAt: undefined,
  rejectionReason: undefined,
  save: jest.fn().mockResolvedValue(undefined),
  toObject() {
    const { toObject, save, ...rest } = this;
    return rest;
  },
  ...over,
});

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const mockCourseModel: any = jest.fn();
const mockTutorModel: any = jest.fn();

describe('AdminCourseService privileged action auditing', () => {
  let service: AdminCourseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCourseModel.findById = jest.fn();
    mockCourseModel.findByIdAndUpdate = jest.fn().mockReturnValue(exec(null));
    mockTutorModel.findByIdAndUpdate = jest.fn().mockReturnValue(exec(null));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCourseService,
        { provide: getModelToken(Course.name), useValue: mockCourseModel },
        { provide: getModelToken(Tutor.name), useValue: mockTutorModel },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EmailService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(AdminCourseService);
  });

  describe('review', () => {
    it('audits an approval with the status transition and the actor', async () => {
      mockCourseModel.findById.mockReturnValue(exec(courseDoc()));

      await service.review(
        'course-1',
        { decision: 'approved' } as never,
        'admin-7',
        audit,
      );

      const entry = entryFor(AuditAction.COURSE_REVIEWED);
      expect(entry.context).toBe(audit);
      expect(entry.target).toEqual({ type: 'course', id: 'course-1' });
      expect(entry.before).toEqual(
        expect.objectContaining({ status: 'pending' }),
      );
      expect(entry.after).toEqual(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('records the rejection reason', async () => {
      mockCourseModel.findById.mockReturnValue(exec(courseDoc()));

      await service.review(
        'course-1',
        { decision: 'rejected', reason: 'thin curriculum' } as never,
        'admin-7',
        audit,
      );

      const entry = entryFor(AuditAction.COURSE_REVIEWED);
      expect(entry.reason).toBe('thin curriculum');
      expect(entry.after).toEqual(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    it('does not audit a review the service refuses', async () => {
      mockCourseModel.findById.mockReturnValue(
        exec(courseDoc({ status: 'published' })),
      );

      await expect(
        service.review(
          'course-1',
          { decision: 'approved' } as never,
          'admin-7',
          audit,
        ),
      ).rejects.toThrow(/Only pending courses/);

      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('attributes the review to the admin even without an HTTP context', async () => {
      mockCourseModel.findById.mockReturnValue(exec(courseDoc()));

      await service.review(
        'course-1',
        { decision: 'approved' } as never,
        'admin-7',
      );

      expect(entryFor(AuditAction.COURSE_REVIEWED).context.actorId).toBe(
        'admin-7',
      );
    });
  });

  describe('publish and unpublish', () => {
    it('audits an admin publish', async () => {
      mockCourseModel.findById.mockReturnValue(
        exec(courseDoc({ status: 'approved' })),
      );

      await service.publish('course-1', 'admin-7', true, audit);

      const entry = entryFor(AuditAction.COURSE_PUBLISHED);
      expect(entry.before).toEqual(
        expect.objectContaining({ status: 'approved' }),
      );
      expect(entry.after).toEqual(
        expect.objectContaining({ status: 'published' }),
      );
    });

    it('audits an admin unpublish', async () => {
      mockCourseModel.findById.mockReturnValue(
        exec(courseDoc({ status: 'published' })),
      );

      await service.unpublish('course-1', 'admin-7', true, audit);

      expect(entryFor(AuditAction.COURSE_UNPUBLISHED)).toBeDefined();
    });

    // Tutors acting on their own courses are ordinary authorship, not a
    // privileged action, so they stay out of the audit trail.
    it('does not audit a tutor publishing their own course', async () => {
      mockCourseModel.findById.mockReturnValue(
        exec(courseDoc({ status: 'approved' })),
      );

      await service.publish('course-1', '507f1f77bcf86cd799439011', false);

      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('audits an admin deletion with the reason', async () => {
      mockCourseModel.findById.mockReturnValue(
        exec(courseDoc({ status: 'published' })),
      );

      await service.delete('course-1', 'admin-7', true, 'DMCA takedown', audit);

      const entry = entryFor(AuditAction.COURSE_DELETED);
      expect(entry.reason).toBe('DMCA takedown');
      expect(entry.after).toEqual(
        expect.objectContaining({ deletedBy: 'admin:admin-7' }),
      );
    });

    it('does not audit a tutor deleting their own course', async () => {
      mockCourseModel.findById.mockReturnValue(exec(courseDoc()));

      await service.delete('course-1', '507f1f77bcf86cd799439011', false);

      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('audits an admin update', async () => {
      mockCourseModel.findById.mockReturnValue(exec(courseDoc()));

      await service.update(
        'course-1',
        { title: 'Solidity 102' },
        'admin-7',
        true,
        audit,
      );

      const entry = entryFor(AuditAction.COURSE_UPDATED);
      expect(entry.before).toEqual(
        expect.objectContaining({ title: 'Solidity 101' }),
      );
      expect(entry.after).toEqual(
        expect.objectContaining({ title: 'Solidity 102' }),
      );
    });
  });
});
