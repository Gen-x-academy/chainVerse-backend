/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { MentorshipFeedbackService } from './mentorship-feedback.service';

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
    findById: jest.fn((id: string) =>
      query(() => rows.find((r) => r.id === id) ?? null),
    ),
    find: jest.fn((filter: any) =>
      query(() =>
        rows.filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        ),
      ),
    ),
    create: jest.fn(async (doc: any) => {
      const row = {
        id: `f${rows.length + 1}`,
        ...doc,
        save: jest.fn(async () => row),
        toObject: () => ({ ...row }),
      };
      rows.push(row);
      return row;
    }),
  };
  return { service: new MentorshipFeedbackService(model) };
}

describe('MentorshipFeedbackService (MENTOR-066)', () => {
  it('enforces one response per role', async () => {
    const { service } = build();
    await service.submit(
      { sessionId: 's1', role: 'mentor' as any, rating: 5 },
      { userId: 'm1' },
    );
    await expect(
      service.submit(
        { sessionId: 's1', role: 'mentor' as any, rating: 4 },
        { userId: 'm1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacts protected comments and aggregates consented data', async () => {
    const { service } = build();
    await service.submit(
      {
        sessionId: 's1',
        role: 'mentor' as any,
        rating: 5,
        comment: 'secret',
        protectedComment: true,
        revealAt: '2099-01-01T00:00:00.000Z',
      },
      { userId: 'm1' },
    );
    await service.submit(
      {
        sessionId: 's1',
        role: 'mentee' as any,
        rating: 3,
        consentToAggregate: true,
      },
      { userId: 'e1' },
    );
    const list = await service.listForSession('s1', { userId: 'e1' });
    expect(list[0].comment).toBe('[protected until reveal]');
    const agg = await service.aggregate('s1');
    expect(agg.count).toBe(2);
    expect(agg.averageRating).toBe(4);
  });
});
