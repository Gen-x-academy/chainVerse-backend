/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MentorshipWorkspaceService } from './mentorship-workspace.service';

function build() {
  const rows: any[] = [];
  const query = (result: () => unknown) => ({ exec: async () => result() });
  const model: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          rows.find((r) =>
            Object.entries(filter).every(([k, v]) => r[k] === v),
          ) ?? null,
      ),
    ),
    create: jest.fn(async (doc: any) => {
      const row = { ...doc, save: jest.fn(async () => row) };
      rows.push(row);
      return row;
    }),
  };
  return { service: new MentorshipWorkspaceService(model), rows };
}

describe('MentorshipWorkspaceService (MENTOR-061)', () => {
  it('creates idempotently and allows only participants/staff', async () => {
    const { service } = build();
    const dto = { sessionId: 's1', mentorId: 'm1', menteeId: 'e1' };
    const ws = await service.create(dto, { userId: 'm1' });
    expect(ws.sessionId).toBe('s1');
    const again = await service.create(dto, { userId: 'm1' });
    expect(again).toBe(ws);

    await expect(
      service.getBySession('s1', { userId: 'intruder' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const staff = await service.getBySession('s1', {
      userId: 'admin1',
      roles: ['admin'],
    });
    expect(staff.sessionId).toBe('s1');
  });

  it('blocks updates when read-only', async () => {
    const { service } = build();
    await service.create(
      { sessionId: 's2', mentorId: 'm1', menteeId: 'e1' },
      { userId: 'm1' },
    );
    await service.markReadOnly('s2', { userId: 'm1' });
    await expect(
      service.update('s2', { agenda: ['x'] }, { userId: 'm1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
