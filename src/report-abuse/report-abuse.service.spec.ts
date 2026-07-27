import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { ReportAbuseService } from './report-abuse.service';
import { AbuseReport } from './schemas/report-abuse.schema';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import { AuditContext } from '../common/audit/audit-context';

const audit: AuditContext = {
  actorId: 'mod-1',
  actorEmail: 'mod@chainverse.io',
  actorRole: 'moderator',
  requestId: 'req-mod-1',
  ip: '10.0.0.2',
  userAgent: 'jest',
};

const auditService = { record: jest.fn().mockResolvedValue(null) };
const entryFor = (action: AuditAction) =>
  auditService.record.mock.calls
    .map(([entry]) => entry)
    .find((entry) => entry.action === action);

const report = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  reporterUserId: 'student-9',
  reason: 'spam',
  contentId: 'c-1',
  contentType: 'course',
  status: 'pending',
  adminNotes: undefined,
  toObject() {
    const { toObject, ...rest } = this;
    return rest;
  },
  ...over,
});

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const mockModel: any = jest.fn();
mockModel.findById = jest.fn();
mockModel.findByIdAndUpdate = jest.fn();
mockModel.findByIdAndDelete = jest.fn();
mockModel.find = jest.fn();

describe('ReportAbuseService moderation auditing', () => {
  let service: ReportAbuseService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportAbuseService,
        { provide: getModelToken(AbuseReport.name), useValue: mockModel },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(ReportAbuseService);
  });

  describe('update', () => {
    it('captures the status transition in before/after', async () => {
      mockModel.findById.mockReturnValue(exec(report()));
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec(report({ status: 'resolved', adminNotes: 'handled' })),
      );

      await service.update('r-1', { status: 'resolved' }, audit);

      const entry = entryFor(AuditAction.ABUSE_REPORT_UPDATED);
      expect(entry.context).toBe(audit);
      expect(entry.target).toEqual({ type: 'abuse_report', id: 'r-1' });
      expect(entry.before).toEqual(
        expect.objectContaining({ status: 'pending' }),
      );
      expect(entry.after).toEqual(
        expect.objectContaining({ status: 'resolved', adminNotes: 'handled' }),
      );
    });

    it('reads the report before writing so the before snapshot is real', async () => {
      mockModel.findById.mockReturnValue(exec(report()));
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec(report({ status: 'resolved' })),
      );

      await service.update('r-1', { status: 'resolved' }, audit);

      expect(mockModel.findById).toHaveBeenCalledWith('r-1');
    });

    it('does not audit an update to a report that does not exist', async () => {
      mockModel.findById.mockReturnValue(exec(null));

      await expect(
        service.update('missing', { status: 'resolved' }, audit),
      ).rejects.toThrow(NotFoundException);

      expect(mockModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('audits the deletion with the prior state', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(report()));

      await service.remove('r-1', audit);

      const entry = entryFor(AuditAction.ABUSE_REPORT_DELETED);
      expect(entry.before).toEqual(
        expect.objectContaining({ contentId: 'c-1', status: 'pending' }),
      );
      expect(entry.after).toBeNull();
    });

    it('masks the reporter address in the snapshot', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(
        exec(report({ reporterUserId: 'reporter@chainverse.io' })),
      );

      await service.remove('r-1', audit);

      const entry = entryFor(AuditAction.ABUSE_REPORT_DELETED);
      expect(entry.before.reporterUserId).toBe('r*******@chainverse.io');
    });

    it('does not audit a deletion that never happened', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(null));

      await expect(service.remove('missing', audit)).rejects.toThrow(
        NotFoundException,
      );
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });
});
