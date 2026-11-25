import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MentorshipSafetyCenterService } from './safety-center.service';
import { SafetyCaseStatus } from './schemas/safety.schema';

const telemetry = { count: jest.fn(), event: jest.fn(), warn: jest.fn() };

function make(caseDoc: Record<string, unknown> | null, blocking = { block: jest.fn() }) {
  const cases = {
    findById: jest.fn(() => ({ exec: async () => caseDoc })),
    findOneAndUpdate: jest.fn((_q, u) => ({ exec: async () => (caseDoc ? { ...caseDoc, ...u.$set } : null) })),
    create: jest.fn(async (d) => ({ _id: 'c1', ...d })),
  };
  return {
    blocking,
    service: new MentorshipSafetyCenterService({} as never, cases as never, blocking as never, telemetry as never),
  };
}

const report = { subjectId: 'u2', category: 'harassment' as const, description: 'repeated unwanted messages', idempotencyKey: 'key-12345' };

describe('MentorshipSafetyCenterService', () => {
  it('serves conduct rules and emergency guidance', () => {
    const g = make(null).service.guidance();
    expect(g.conductRules.length).toBeGreaterThan(0);
    expect(g.emergency.disclaimer).toMatch(/not an emergency service/);
  });

  it('rejects self-reports and hides internal fields from the reporter', async () => {
    const { service } = make(null);
    await expect(service.report('u2', report)).rejects.toBeInstanceOf(ConflictException);
    const view = await service.report('u1', report);
    expect(view).not.toHaveProperty('internalNotes');
    expect(view).not.toHaveProperty('assignedTo');
  });

  it('blocks the subject when asked', async () => {
    const { service, blocking } = make(null);
    await service.report('u1', report, true);
    expect(blocking.block).toHaveBeenCalledWith('u1', expect.objectContaining({ blockedUserId: 'u2' }));
  });

  it('does not reveal other users’ reports', async () => {
    const { service } = make({ _id: 'c1', reporterId: 'someone-else' });
    await expect(service.getMyReport('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies case management without a safety role', async () => {
    const { service } = make({ status: SafetyCaseStatus.OPEN });
    const user = { userId: 'u', roles: ['student'] };
    await expect(service.listCases(user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateCase('c1', { status: SafetyCaseStatus.UNDER_REVIEW }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces case transitions', async () => {
    const mod = { userId: 'm', roles: ['moderator'] };
    const { service } = make({ status: SafetyCaseStatus.OPEN });
    await expect(service.updateCase('c1', { status: SafetyCaseStatus.RESOLVED }, mod)).rejects.toBeInstanceOf(ConflictException);
    const ok = await service.updateCase('c1', { status: SafetyCaseStatus.UNDER_REVIEW }, mod);
    expect(ok.status).toBe(SafetyCaseStatus.UNDER_REVIEW);
  });
});
