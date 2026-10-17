import { BadRequestException, ConflictException } from '@nestjs/common';
import { MentorshipDeliveryMode } from './mentorship-program.schema';
import { MentorshipProgramService } from './mentorship-program.service';

describe('MentorshipProgramService policy', () => {
  const model = { findOne: jest.fn(), findById: jest.fn() };
  const audit = { record: jest.fn() };
  const telemetry = { record: jest.fn() };
  const service = new MentorshipProgramService(model as never, audit as never, telemetry as never);
  const base = { organizationId: 'org', name: 'Program', deliveryMode: MentorshipDeliveryMode.REMOTE, remotePlatform: 'video', remoteJoinInstructions: 'Use the secure invite', idempotencyKey: 'retry-key-1' } as any;
  it('rejects remote configuration without remote fields', async () => {
    await expect(service.create({ ...base, remotePlatform: undefined }, 'admin', 'admin')).rejects.toThrow(BadRequestException);
  });
  it('rejects precise location fields and exposes broad labels only', async () => {
    const created = { ...base, deliveryMode: MentorshipDeliveryMode.IN_PERSON, location: { countryCode: 'NG', region: 'Lagos', city: 'Lagos' }, remotePlatform: undefined, remoteJoinInstructions: undefined };
    expect(created.location).not.toHaveProperty('address');
  });
  it('uses a stable conflict for unsafe booked configuration changes', async () => {
    const row = { createdBy: 'admin', activeBookingCount: 2, deliveryMode: MentorshipDeliveryMode.REMOTE, location: null };
    model.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(row) });
    await expect(service.update('program', { ...base, deliveryMode: MentorshipDeliveryMode.IN_PERSON, location: { countryCode: 'NG', region: 'Lagos', city: 'Lagos' }, remotePlatform: undefined, remoteJoinInstructions: undefined } as any, 'admin', 'admin')).rejects.toThrow(ConflictException);
  });
});
