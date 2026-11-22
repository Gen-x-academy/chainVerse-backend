/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ForbiddenException } from '@nestjs/common';
import { MentorshipEscrowService } from './mentorship-escrow.service';
import { EscrowFundingStatus } from './schemas/escrow-funding.schema';

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
      const row = {
        id: `e${rows.length + 1}`,
        ...doc,
        save: jest.fn(async () => row),
      };
      rows.push(row);
      return row;
    }),
  };
  return { service: new MentorshipEscrowService(model) };
}

describe('MentorshipEscrowService (MENTOR-079)', () => {
  it('confirms exact funding idempotently and rejects untrusted actors', async () => {
    const { service } = build();
    await service.createIntent({
      agreementId: 'a1',
      expectedAmount: 100,
      currency: 'USD',
      idempotencyKey: 'k1',
    });
    await expect(
      service.confirm(
        {
          agreementId: 'a1',
          amount: 100,
          providerRef: 'p1',
          idempotencyKey: 'k1',
        },
        { userId: 'u1', roles: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ok = await service.confirm(
      {
        agreementId: 'a1',
        amount: 100,
        providerRef: 'p1',
        idempotencyKey: 'k1',
      },
      { userId: 'admin', roles: ['admin'] },
    );
    expect(ok.status).toBe(EscrowFundingStatus.CONFIRMED);
    const replay = await service.confirm(
      {
        agreementId: 'a1',
        amount: 100,
        providerRef: 'p1',
        idempotencyKey: 'k1',
      },
      { userId: 'admin', roles: ['admin'] },
    );
    expect(replay.status).toBe(EscrowFundingStatus.CONFIRMED);
  });

  it('marks underpayment/overpayment explicitly', async () => {
    const { service } = build();
    await service.createIntent({
      agreementId: 'a2',
      expectedAmount: 100,
      currency: 'USD',
      idempotencyKey: 'k2',
    });
    const under = await service.confirm(
      {
        agreementId: 'a2',
        amount: 90,
        providerRef: 'p2',
        idempotencyKey: 'k2',
      },
      { userId: 'admin', roles: ['admin'] },
    );
    expect(under.status).toBe(EscrowFundingStatus.UNDERPAID);
  });
});
