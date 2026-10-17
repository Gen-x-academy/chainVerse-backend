import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MentorshipFacilitatorRole } from './mentorship-facilitator.schema';
import { MentorshipFacilitatorService } from './mentorship-facilitator.service';

describe('MentorshipFacilitatorService policy', () => {
  const model = { findOne: jest.fn(), find: jest.fn() };
  const programs = { findById: jest.fn() };
  const audit = { record: jest.fn() };
  const telemetry = { record: jest.fn() };
  const service = new MentorshipFacilitatorService(model as never, programs as never, audit as never, telemetry as never);
  const dto = { userId: 'reviewer', role: MentorshipFacilitatorRole.APPLICATION_REVIEWER, startsAt: new Date(Date.now() + 1000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: 'assignment-key' };
  it('denies non-management roles by default', async () => {
    await expect(service.assign('program', dto, 'actor', 'student')).rejects.toThrow(ForbiddenException);
  });
  it('rejects expired or inverted tenure with stable errors', async () => {
    programs.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ organizationId: 'org' }) });
    await expect(service.assign('program', { ...dto, startsAt: dto.endsAt, endsAt: dto.startsAt }, 'actor', 'admin')).rejects.toThrow(ConflictException);
  });
  it('rejects separation-of-duty conflicts', async () => {
    programs.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ organizationId: 'org' }) });
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    model.find.mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue([{ role: MentorshipFacilitatorRole.COORDINATOR }]) }) });
    await expect(service.assign('program', dto, 'actor', 'admin')).rejects.toThrow('MENTORSHIP_FACILITATOR_SEPARATION_OF_DUTY');
  });
});
