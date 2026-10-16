import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode } from '../../common/errors';
import { MentorAvailabilityStatus as S } from './availability.machine';
import {
  AVAILABILITY_CHANGED_EVENT,
  MentorAvailabilityService,
} from './availability.service';

const NOW = new Date('2026-06-01T12:00:00Z');
const MENTOR = 'a'.repeat(24);

function build() {
  const rows: any[] = [];
  const query = (result: () => unknown) => {
    const q: any = {
      sort: () => q,
      select: () => q,
      lean: () => q,
      exec: async () => result(),
    };
    return q;
  };
  const model: any = {
    findOne: jest.fn((filter: any) =>
      query(() => {
        const m = rows.filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        );
        return m.sort((a, b) => b.sequence - a.sequence)[0] ?? null;
      }),
    ),
    find: jest.fn((filter: any) =>
      query(() => rows.filter((r) => r.mentorId === filter.mentorId)),
    ),
    create: jest.fn(async (doc: any) => {
      rows.push(doc);
      return doc;
    }),
  };
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  return { service: new MentorAvailabilityService(model, events), model, events, rows };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({ status: S.ACCEPTING, idempotencyKey: 'key-00001', ...over }) as any;

describe('MentorAvailabilityService', () => {
  it('records a change and emits an event', async () => {
    const { service, events } = build();
    const created = await service.setAvailability(MENTOR, dto(), MENTOR, NOW);
    expect(created.sequence).toBe(1);
    expect(events.emit).toHaveBeenCalledWith(
      AVAILABILITY_CHANGED_EVENT,
      expect.objectContaining({ mentorId: MENTOR, status: S.ACCEPTING }),
    );
  });

  it('is idempotent for a retried request', async () => {
    const { service, model, events } = build();
    await service.setAvailability(MENTOR, dto(), MENTOR, NOW);
    await service.setAvailability(MENTOR, dto(), MENTOR, NOW);
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('rejects an idempotency key reused for a different change', async () => {
    const { service } = build();
    await service.setAvailability(MENTOR, dto(), MENTOR, NOW);
    await expect(
      service.setAvailability(MENTOR, dto({ status: S.INACTIVE }), MENTOR, NOW),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_MENTOR_AVAILABILITY_CONFLICT });
  });

  it('requires a cap for limited and forbids it otherwise', async () => {
    const { service } = build();
    await expect(
      service.setAvailability(MENTOR, dto({ status: S.LIMITED }), MENTOR, NOW),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID });
    await expect(
      service.setAvailability(MENTOR, dto({ maxActiveMentees: 3 }), MENTOR, NOW),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID });
  });

  it('rejects past and far-future effective dates', async () => {
    const { service } = build();
    await expect(
      service.setAvailability(
        MENTOR,
        dto({ effectiveFrom: new Date('2026-05-01T00:00:00Z') }),
        MENTOR,
        NOW,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID });
    await expect(
      service.setAvailability(
        MENTOR,
        dto({ effectiveFrom: new Date('2028-01-01T00:00:00Z') }),
        MENTOR,
        NOW,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_MENTOR_AVAILABILITY_INVALID });
  });

  it('keeps a scheduled change dormant until its date', async () => {
    const { service } = build();
    await service.setAvailability(MENTOR, dto({ idempotencyKey: 'key-00001' }), MENTOR, NOW);
    await service.setAvailability(
      MENTOR,
      dto({
        status: S.TEMPORARILY_UNAVAILABLE,
        idempotencyKey: 'key-00002',
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      }),
      MENTOR,
      NOW,
    );
    expect((await service.getPublic(MENTOR, 0, NOW)).status).toBe(S.ACCEPTING);
    const later = new Date('2026-07-01T00:00:00Z');
    const view = await service.getPublic(MENTOR, 0, later);
    expect(view).toMatchObject({ status: S.TEMPORARILY_UNAVAILABLE, applications: 'closed' });
    expect((await service.getOwn(MENTOR, NOW)).upcoming).toHaveLength(1);
  });

  it('defaults to inactive with no history and exposes no private fields', async () => {
    const { service } = build();
    const view = await service.getPublic(MENTOR, 0, NOW);
    expect(view).toEqual({
      mentorId: MENTOR,
      status: S.INACTIVE,
      discoverable: false,
      applications: 'closed',
    });
  });

  it('assertAcceptsApplications throws when closed and returns waitlist mode', async () => {
    const { service } = build();
    await expect(service.assertAcceptsApplications(MENTOR)).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_MENTOR_NOT_ACCEPTING,
    });
  });
});
