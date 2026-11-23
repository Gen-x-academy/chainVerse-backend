import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import {
  BlockerRefDto,
  CancelRematchDto,
  CloseRematchDto,
  PlanClosureDto,
  ProposeSuccessorDto,
  RequestRematchDto,
  ReviewRematchDto,
} from './dto/rematch.dto';
import { RematchActor, RematchService } from './rematch.service';
import {
  BlockerKind,
  BlockerStatus,
  RematchReasonCode,
  RematchState,
} from './schemas/rematch-request.schema';

const ALICE = 'mentor-alice';
const BOB = 'student-bob';
const CAROL = 'outsider-carol';

const alice: RematchActor = { id: ALICE, role: Role.TUTOR };
const bob: RematchActor = { id: BOB, role: Role.STUDENT };
const carol: RematchActor = { id: CAROL, role: Role.STUDENT };
const admin: RematchActor = { id: 'admin-1', role: Role.ADMIN };

function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function applyUpdate(row: Record<string, any>, update: Record<string, any>): void {
  if (update.$set) Object.assign(row, update.$set);
}

class FakeModel {
  rows: Record<string, any>[] = [];
  failNextCreate = false;

  private query(filter: Record<string, any>, all: boolean) {
    const chain: any = {
      sortOrder: null as Record<string, number> | null,
      sort(order: Record<string, number>) {
        this.sortOrder = order;
        return this;
      },
      exec: async () => {
        let result = this.rows.filter((row) => matches(row, filter));
        if (chain.sortOrder) {
          const [key, direction] = Object.entries(chain.sortOrder)[0] as [string, number];
          result = [...result].sort(
            (a, b) =>
              (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * direction,
          );
        }
        return all ? result : result[0] ?? null;
      },
    };
    return chain;
  }

  findOne = (filter: Record<string, any>) => this.query(filter, false);
  find = (filter: Record<string, any>) => this.query(filter, true);
  findById = (id: unknown) => ({
    exec: async () => this.rows.find((row) => String(row._id) === String(id)) ?? null,
  });

  create = async (doc: Record<string, any>) => {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    const row = { _id: new Types.ObjectId(), createdAt: new Date(), ...doc };
    this.rows.push(row);
    return row;
  };

  findOneAndUpdate = (filter: Record<string, any>, update: Record<string, any>) => ({
    exec: async () => {
      const row = this.rows.find((candidate) => matches(candidate, filter));
      if (!row) return null;
      applyUpdate(row, update);
      return row;
    },
  });
}

function setup() {
  const requests = new FakeModel();
  const events = new FakeModel();
  const telemetry = { count: jest.fn() };
  const service = new RematchService(
    requests as never,
    events as never,
    telemetry as never,
  );
  return { service, requests, events, telemetry };
}

function requestDto(overrides: Partial<RequestRematchDto> = {}) {
  return plainToInstance(RequestRematchDto, {
    mentorshipId: 'mentorship-1',
    counterpartId: BOB,
    participantIds: [ALICE, BOB],
    reasonCode: RematchReasonCode.INCOMPATIBILITY,
    privateReason: 'Private conflict details',
    blockers: [],
    ...overrides,
  });
}

describe('Rematch DTO validation', () => {
  it('accepts a valid request', async () => {
    await expect(validate(requestDto())).resolves.toEqual([]);
  });

  it.each([
    ['only one participant', { participantIds: [ALICE] }],
    ['an unknown reason code', { reasonCode: 'blame' }],
    ['a counterpart outside the participants', { counterpartId: CAROL }],
  ])('rejects %s', async (_label, override) => {
    expect((await validate(requestDto(override))).length).toBeGreaterThan(0);
  });

  it('rejects an invalid nested blocker status', async () => {
    const blocker = plainToInstance(BlockerRefDto, {
      kind: BlockerKind.FINANCIAL,
      ref: 'case-1',
      status: 'pending',
    });
    expect((await validate(blocker)).length).toBeGreaterThan(0);
  });
});

describe('RematchService request and privacy', () => {
  it('lets a participant request and scopes the private reason to the requester', async () => {
    const { service, events } = setup();

    const view = await service.request(alice, requestDto());

    expect(view.state).toBe(RematchState.REQUESTED);
    expect(view.privateReason).toBe('Private conflict details');
    expect(events.rows).toHaveLength(1);
  });

  it('hides the private reason from the counterpart but not a coordinator', async () => {
    const { service, requests } = setup();
    await service.request(alice, requestDto());
    const doc = requests.rows[0];

    const counterpartView = await service.get(bob, String(doc._id));
    const coordinatorView = await service.get(admin, String(doc._id));

    expect(counterpartView).not.toHaveProperty('privateReason');
    expect(coordinatorView.privateReason).toBe('Private conflict details');
  });

  it('is idempotent for a repeated open request', async () => {
    const { service, requests } = setup();
    const first = await service.request(alice, requestDto());
    const again = await service.request(alice, requestDto());

    expect(again.id).toBe(first.id);
    expect(requests.rows).toHaveLength(1);
  });

  it('denies a non-participant requester', async () => {
    const { service } = setup();

    await expect(service.request(carol, requestDto())).rejects.toMatchObject({
      errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
    });
  });

  it('returns the winner when a duplicate-key race is lost', async () => {
    const { service, requests } = setup();
    await service.request(alice, requestDto());
    requests.failNextCreate = true;

    const replay = await service.request(alice, requestDto());

    expect(replay.requesterId).toBe(ALICE);
    expect(requests.rows).toHaveLength(1);
  });
});

describe('RematchService state machine and safety', () => {
  async function requestedWithBlockers(blockers: BlockerRefDto[]) {
    const ctx = setup();
    const view = await ctx.service.request(alice, requestDto({ blockers }));
    return { ...ctx, id: view.id };
  }

  it('walks requested -> reviewed -> closure_planned -> proposed -> closed', async () => {
    const { service, id, events } = await requestedWithBlockers([]);

    await service.review(admin, id, plainToInstance(ReviewRematchDto, { note: 'Reviewed' }));
    await service.planClosure(
      alice,
      id,
      plainToInstance(PlanClosureDto, { continuityNotes: 'Hand over notes cleanly' }),
    );
    await service.proposeSuccessor(
      bob,
      id,
      plainToInstance(ProposeSuccessorDto, { candidateId: 'new-mentor-1' }),
    );
    const closed = await service.close(admin, id, plainToInstance(CloseRematchDto, {}));

    expect(closed.state).toBe(RematchState.CLOSED);
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(events.rows).toHaveLength(5);
  });

  it('rejects an out-of-order transition', async () => {
    const { service, id } = await requestedWithBlockers([]);

    await expect(
      service.planClosure(
        alice,
        id,
        plainToInstance(PlanClosureDto, { continuityNotes: 'Too early' }),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_INVALID_STATE_TRANSITION });
  });

  it('blocks successor and closure while a financial or safety case is open', async () => {
    const blockers: BlockerRefDto[] = [
      plainToInstance(BlockerRefDto, {
        kind: BlockerKind.FINANCIAL,
        ref: 'case-fin-1',
        status: BlockerStatus.OPEN,
      }),
    ];
    const { service, id, requests } = await requestedWithBlockers(blockers);
    await service.review(admin, id, plainToInstance(ReviewRematchDto, {}));
    await service.planClosure(
      alice,
      id,
      plainToInstance(PlanClosureDto, { continuityNotes: 'Plan' }),
    );

    await expect(
      service.proposeSuccessor(
        bob,
        id,
        plainToInstance(ProposeSuccessorDto, { candidateId: 'x' }),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_MENTORSHIP_BLOCKED });

    // Simulate the case being resolved upstream; the request record stays intact.
    requests.rows[0].blockers[0].status = BlockerStatus.CLOSED;
    await expect(
      service.proposeSuccessor(
        bob,
        id,
        plainToInstance(ProposeSuccessorDto, { candidateId: 'x' }),
      ),
    ).resolves.toMatchObject({ state: RematchState.PROPOSED });
  });

  it('only a coordinator may review', async () => {
    const { service, id } = await requestedWithBlockers([]);

    await expect(
      service.review(alice, id, plainToInstance(ReviewRematchDto, {})),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('only the requester or a coordinator may cancel', async () => {
    const { service, id } = await requestedWithBlockers([]);

    await expect(
      service.cancel(bob, id, plainToInstance(CancelRematchDto, {})),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(
      (await service.cancel(alice, id, plainToInstance(CancelRematchDto, {}))).state,
    ).toBe(RematchState.CANCELLED);
  });

  it('hides transition-note free text from the counterpart', async () => {
    const { service, id } = await requestedWithBlockers([]);
    await service.review(admin, id, plainToInstance(ReviewRematchDto, { note: 'Confidential' }));

    const counterpartHistory = await service.history(bob, id);
    const requesterHistory = await service.history(alice, id);

    expect(counterpartHistory.every((event) => !('note' in event))).toBe(true);
    expect(requesterHistory.some((event) => event.note === 'Confidential')).toBe(true);
  });

  it('reports aggregate, non-blaming metrics without identifiers', async () => {
    const { service } = setup();
    await service.request(alice, requestDto());

    const metrics = await service.metrics();

    expect(metrics.total).toBe(1);
    expect(metrics.byState[RematchState.REQUESTED]).toBe(1);
    expect(metrics.byReasonCode[RematchReasonCode.INCOMPATIBILITY]).toBe(1);
    expect(metrics).not.toHaveProperty('byActor');
    expect(JSON.stringify(metrics)).not.toContain(ALICE);
  });
});
