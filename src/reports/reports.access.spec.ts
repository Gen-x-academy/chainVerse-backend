import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { createResponse } from 'node-mocks-http';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ForbiddenDomainException } from '../common/errors';
import { Role } from '../common/enums/role.enum';
import { ReportsController } from './reports.controller';
import { ReportType } from './dto/report-type.enum';

const reportsService = { getTutorReport: jest.fn((id: string) => ({ tutorId: id })) };
const exportService = { export: jest.fn().mockResolvedValue('a,b') };
const controller = new ReportsController(reportsService as never, exportService as never);

const handler = ReportsController.prototype.getTutorReport;

function contextFor(user?: object, headers: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
  } as never;
}

beforeEach(() => jest.clearAllMocks());

describe('reports endpoints require authentication and a role', () => {
  it('are not public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ReportsController)).toBeFalsy();
  });

  it('run the JWT and roles guards, limited to admins and tutors', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController)).toEqual([Role.ADMIN, Role.TUTOR]);
  });

  it('answer an anonymous request with 401', () => {
    const jwt = new JwtAuthGuard({} as never, {} as never, new Reflector(), {} as never);

    expect(() => jwt.canActivate(contextFor())).toThrow(UnauthorizedException);
  });

  describe('answer the wrong role with 403', () => {
    const roles = new RolesGuard(new Reflector());

    it.each([Role.STUDENT, Role.MODERATOR, Role.LIBRARIAN])('%s', (role) => {
      expect(() => roles.canActivate(contextFor({ sub: 'u1', role }))).toThrow(
        ForbiddenException,
      );
    });

    it.each([Role.ADMIN, Role.TUTOR])('lets %s through the role check', (role) => {
      expect(roles.canActivate(contextFor({ sub: 'u1', role }))).toBe(true);
    });
  });
});

describe('a tutor can only reach their own report', () => {
  const tutor = { sub: 'tutor-1', role: Role.TUTOR };
  const admin = { sub: 'admin-1', role: Role.ADMIN };

  it('lets a tutor read their own report', () => {
    expect(controller.getTutorReport('tutor-1', tutor)).toEqual({ tutorId: 'tutor-1' });
  });

  it("refuses a tutor reading another tutor's report", () => {
    expect(() => controller.getTutorReport('tutor-2', tutor)).toThrow(ForbiddenDomainException);
    expect(reportsService.getTutorReport).not.toHaveBeenCalled();
  });

  it('lets an admin read any report', () => {
    expect(controller.getTutorReport('tutor-2', admin)).toEqual({ tutorId: 'tutor-2' });
  });

  it('refuses a caller with no identity', () => {
    expect(() => controller.getTutorReport('tutor-1', { role: Role.TUTOR })).toThrow(
      ForbiddenDomainException,
    );
  });

  describe('export', () => {
    const request = (tutorId: string) => ({ reportType: ReportType.TUTOR_REPORT, tutorId });

    it("refuses a tutor exporting another tutor's report, before any data is read", async () => {
      await expect(
        controller.exportReport(request('tutor-2'), createResponse(), tutor),
      ).rejects.toBeInstanceOf(ForbiddenDomainException);
      expect(exportService.export).not.toHaveBeenCalled();
    });

    it('lets a tutor export their own report', async () => {
      const res = createResponse();

      await controller.exportReport(request('tutor-1'), res, tutor);

      expect(exportService.export).toHaveBeenCalledWith(ReportType.TUTOR_REPORT, 'tutor-1');
      expect(res._getData()).toBe('a,b');
    });

    it('lets an admin export any tutor report', async () => {
      await controller.exportReport(request('tutor-2'), createResponse(), admin);

      expect(exportService.export).toHaveBeenCalledWith(ReportType.TUTOR_REPORT, 'tutor-2');
    });
  });
});
