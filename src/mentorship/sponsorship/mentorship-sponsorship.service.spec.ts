/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MentorshipSponsorshipService } from './mentorship-sponsorship.service';
import { ReservationStatus } from './schemas/sponsorship.schema';

function build() {
  const sponsorships: any[] = [];
  const reservations: any[] = [];
  const q = (r: () => unknown) => ({ exec: async () => r() });
  const spModel: any = {
    create: jest.fn(async (d: any) => {
      const row = { id: `sp${sponsorships.length + 1}`, ...d };
      sponsorships.push(row);
      return row;
    }),
    findById: jest.fn((id: string) =>
      q(() => sponsorships.find((r) => r.id === id) ?? null),
    ),
    findOneAndUpdate: jest.fn((filter: any, update: any) =>
      q(() => {
        const row = sponsorships.find(
          (r) => r.id === filter._id && r.status === filter.status,
        );
        if (!row) return null;
        const available =
          row.totalBudget - row.reservedAmount - row.spentAmount;
        if (available < filter.$expr.$gte[1]) return null;
        row.reservedAmount += update.$inc.reservedAmount;
        return row;
      }),
    ),
    findByIdAndUpdate: jest.fn((id: string, update: any) =>
      q(() => {
        const row = sponsorships.find((r) => r.id === id);
        if (row) row.reservedAmount += update.$inc.reservedAmount;
        return row;
      }),
    ),
  };
  const resModel: any = {
    findOne: jest.fn((f: any) =>
      q(
        () =>
          reservations.find(
            (r) =>
              r.sponsorshipId === f.sponsorshipId &&
              r.idempotencyKey === f.idempotencyKey,
          ) ?? null,
      ),
    ),
    create: jest.fn(async (d: any) => {
      const row = {
        id: `r${reservations.length + 1}`,
        ...d,
        save: jest.fn(async () => row),
      };
      reservations.push(row);
      return row;
    }),
    findById: jest.fn((id: string) =>
      q(() => reservations.find((r) => r.id === id) ?? null),
    ),
    find: jest.fn((f: any) =>
      q(() => reservations.filter((r) => r.sponsorshipId === f.sponsorshipId)),
    ),
  };
  return {
    service: new MentorshipSponsorshipService(spModel, resModel),
    reservations,
  };
}

describe('MentorshipSponsorshipService (MENTOR-082)', () => {
  it('enforces budget atomically and releases reservations', async () => {
    const { service } = build();
    const sp = await service.create({
      sponsorId: 's1',
      programId: 'p1',
      currency: 'USD',
      totalBudget: 100,
    });
    const r1 = await service.reserve(sp.id, {
      engagementId: 'e1',
      amount: 80,
      idempotencyKey: 'k1',
    });
    await expect(
      service.reserve(sp.id, {
        engagementId: 'e2',
        amount: 30,
        idempotencyKey: 'k2',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.release(r1.id);
    expect(r1.status).toBe(ReservationStatus.RELEASED);
  });

  it('restricts spend report to sponsor', async () => {
    const { service } = build();
    const sp = await service.create({
      sponsorId: 's1',
      programId: 'p1',
      currency: 'USD',
      totalBudget: 100,
    });
    await expect(service.report(sp.id, 'other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const report = await service.report(sp.id, 's1');
    expect(report.remaining).toBe(100);
  });
});
