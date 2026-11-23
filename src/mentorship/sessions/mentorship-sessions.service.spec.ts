/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ForbiddenException } from '@nestjs/common';
import { MentorshipSessionsService } from './mentorship-sessions.service';
import { MentorshipSessionStatus } from './schemas/mentorship-session.schema';

function build() {
  const rows: any[] = [];
  const query = (result: () => unknown) => {
    const q: any = { exec: async () => result() };
    return q;
  };
  const model: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          rows.find((r) =>
            Object.entries(filter).every(([k, v]) => r[k] === v),
          ) ?? null,
      ),
    ),
    findById: jest.fn((id: string) =>
      query(() => rows.find((r) => r.id === id) ?? null),
    ),
    create: jest.fn(async (doc: any) => {
      const row = { id: `s${rows.length + 1}`, ...doc };
      rows.push(row);
      return row;
    }),
    findOneAndUpdate: jest.fn((filter: any, update: any) =>
      query(() => {
        const row = rows.find(
          (r) =>
            String(r.id) === String(filter._id) && r.status === filter.status,
        );
        if (!row) return null;
        Object.assign(row, update.$set ?? {});
        return row;
      }),
    ),
  };
  return { service: new MentorshipSessionsService(model), rows };
}

describe('MentorshipSessionsService cancel (MENTOR-058)', () => {
  it('cancels a booked session idempotently and records policy/notice/fee', async () => {
    const { service } = build();
    const session = await service.create({
      agreementId: 'a1',
      mentorId: 'mentor1',
      menteeId: 'mentee1',
      scheduledStart: '2026-12-01T10:00:00.000Z',
      scheduledEnd: '2026-12-01T11:00:00.000Z',
      idempotencyKey: 'create-key-1',
    });

    const now = new Date('2026-11-30T08:00:00.000Z'); // >24h notice
    const cancelled = await service.cancel(
      session.id,
      {
        actorType: 'mentor' as any,
        actorId: 'mentor1',
        reason: 'conflict',
        idempotencyKey: 'cancel-key-1',
        policyVersion: '2026-01',
      },
      now,
    );
    expect(cancelled.status).toBe(MentorshipSessionStatus.CANCELLED);
    expect(cancelled.cancellation).toMatchObject({
      actorId: 'mentor1',
      reason: 'conflict',
      policyVersion: '2026-01',
      feeConsequence: 'no_fee',
    });
    expect(cancelled.cancellation.noticePeriodMinutes).toBeGreaterThan(
      24 * 60 - 5,
    );

    const again = await service.cancel(
      session.id,
      {
        actorType: 'mentor' as any,
        actorId: 'mentor1',
        reason: 'conflict',
        idempotencyKey: 'cancel-key-2',
      },
      now,
    );
    expect(again.status).toBe(MentorshipSessionStatus.CANCELLED);
    expect(again.cancellation.instructionId).toBe(
      cancelled.cancellation.instructionId,
    );
  });

  it('rejects unauthorized actor', async () => {
    const { service } = build();
    const session = await service.create({
      agreementId: 'a1',
      mentorId: 'mentor1',
      menteeId: 'mentee1',
      scheduledStart: '2026-12-01T10:00:00.000Z',
      scheduledEnd: '2026-12-01T11:00:00.000Z',
      idempotencyKey: 'create-key-1',
    });

    await expect(
      service.cancel(
        session.id,
        {
          actorType: 'mentee' as any,
          actorId: 'intruder',
          reason: 'nope',
          idempotencyKey: 'cancel-key-1',
        },
        new Date('2026-11-30T08:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
