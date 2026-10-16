import { MentorshipLifecycleService } from './mentorship-lifecycle.service';
import {
  MentorshipActor,
  MentorshipActorKind,
  MentorshipState,
} from './mentorship-lifecycle.machine';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

class FakeLifecycles {
  rows: any[] = [];
  /** Lets a test make the next guarded update lose to a concurrent writer. */
  loseNextUpdate = false;

  findOne = (filter: { mentorshipId: string }) => ({
    exec: async () => this.rows.find((r) => r.mentorshipId === filter.mentorshipId) ?? null,
  });
  create = async (doc: Record<string, any>) => {
    if (this.rows.some((r) => r.mentorshipId === doc.mentorshipId)) {
      throw Object.assign(new Error('E11000'), { code: 11000 });
    }
    const row = { ...doc };
    this.rows.push(row);
    return row;
  };
  updateOne = async (
    filter: { mentorshipId: string; version: number; state: string },
    update: { $set: { state: string }; $inc: { version: number } },
  ) => {
    if (this.loseNextUpdate) {
      this.loseNextUpdate = false;
      return { modifiedCount: 0 };
    }
    const row = this.rows.find(
      (r) => r.mentorshipId === filter.mentorshipId && r.version === filter.version && r.state === filter.state,
    );
    if (!row) return { modifiedCount: 0 };
    row.state = update.$set.state;
    row.version += update.$inc.version;
    return { modifiedCount: 1 };
  };
}

class FakeEvents {
  rows: any[] = [];
  create = async (doc: Record<string, any>) => {
    if (this.rows.some((r) => r.mentorshipId === doc.mentorshipId && r.sequence === doc.sequence)) {
      throw Object.assign(new Error('E11000'), { code: 11000 });
    }
    this.rows.push({ ...doc });
    return doc;
  };
  find = (filter: { mentorshipId: string }) => {
    let result = this.rows.filter((r) => r.mentorshipId === filter.mentorshipId);
    const chain = {
      sort: (order: { sequence: number }) => {
        result = [...result].sort((a, b) => (a.sequence - b.sequence) * order.sequence);
        return chain;
      },
      exec: async () => result,
    };
    return chain;
  };
}

const ID = 'm-1';
const owner: MentorshipActor = { id: 'mentor-1', kind: MentorshipActorKind.OWNER };
const mentee: MentorshipActor = { id: 'mentee-1', kind: MentorshipActorKind.MENTEE };
const admin: MentorshipActor = { id: 'admin-1', kind: MentorshipActorKind.ADMIN };
const system: MentorshipActor = { id: 'matching', kind: MentorshipActorKind.SYSTEM };

function setup() {
  const lifecycles = new FakeLifecycles();
  const events = new FakeEvents();
  const service = new MentorshipLifecycleService(lifecycles as never, events as never);
  return { service, lifecycles, events };
}

/** draft -> published -> accepting -> matched -> active */
async function toActive(service: MentorshipLifecycleService) {
  await service.start(ID);
  await service.transition(ID, MentorshipState.PUBLISHED, owner);
  await service.transition(ID, MentorshipState.ACCEPTING, owner);
  await service.transition(ID, MentorshipState.MATCHED, system);
  await service.transition(ID, MentorshipState.ACTIVE, owner);
}

describe('MentorshipLifecycleService', () => {
  it('starts in draft, and starting again changes nothing', async () => {
    const { service, lifecycles } = setup();

    const first = await service.start(ID);
    const second = await service.start(ID);

    expect(first).toEqual({ mentorshipId: ID, state: MentorshipState.DRAFT, version: 0 });
    expect(second).toEqual(first);
    expect(lifecycles.rows).toHaveLength(1);
  });

  it('survives losing the race to create the lifecycle', async () => {
    const { service, lifecycles } = setup();
    const realCreate = lifecycles.create;
    lifecycles.create = async (doc: Record<string, any>) => {
      await realCreate({ ...doc });
      return realCreate(doc);
    };

    await expect(service.start(ID)).resolves.toMatchObject({ state: MentorshipState.DRAFT });
    expect(lifecycles.rows).toHaveLength(1);
  });

  it('reports a missing lifecycle as not found', async () => {
    const { service } = setup();

    await expect(service.get('nope')).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(service.transition('nope', MentorshipState.PUBLISHED, owner)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('moves along allowed transitions and records every change', async () => {
    const { service, events } = setup();

    await toActive(service);

    expect((await service.get(ID)).state).toBe(MentorshipState.ACTIVE);
    expect(events.rows.map((e) => [e.sequence, e.from, e.to])).toEqual([
      [1, 'draft', 'published'],
      [2, 'published', 'accepting'],
      [3, 'accepting', 'matched'],
      [4, 'matched', 'active'],
    ]);
  });

  it('records actor, reason, time and prior state for a change', async () => {
    const { service } = setup();
    await toActive(service);

    await service.transition(ID, MentorshipState.PAUSED, mentee, '  exams  ');
    const history = await service.history(ID);
    const last = history.at(-1)!;

    expect(last).toMatchObject({
      sequence: 5,
      from: 'active',
      to: 'paused',
      actor: mentee,
      reason: 'exams',
    });
    expect(new Date(last.at).toString()).not.toBe('Invalid Date');
  });

  it('is idempotent: repeating a transition changes nothing and records nothing', async () => {
    const { service, events } = setup();
    await toActive(service);
    await service.transition(ID, MentorshipState.PAUSED, owner, 'break');
    const rowsBefore = events.rows.length;

    const retry = await service.transition(ID, MentorshipState.PAUSED, owner, 'break');

    expect(retry.changed).toBe(false);
    expect(retry.state).toBe(MentorshipState.PAUSED);
    expect(events.rows).toHaveLength(rowsBefore);
  });

  it('refuses a forbidden transition and writes nothing', async () => {
    const { service, events, lifecycles } = setup();
    await service.start(ID);

    await expect(service.transition(ID, MentorshipState.COMPLETED, admin)).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
    });
    expect(lifecycles.rows[0].state).toBe(MentorshipState.DRAFT);
    expect(events.rows).toHaveLength(0);
  });

  it('refuses an actor who may not make the move and writes nothing', async () => {
    const { service, events, lifecycles } = setup();
    await service.start(ID);

    await expect(service.transition(ID, MentorshipState.PUBLISHED, mentee)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
    expect(lifecycles.rows[0].version).toBe(0);
    expect(events.rows).toHaveLength(0);
  });

  it('keeps final states final', async () => {
    const { service } = setup();
    await service.start(ID);
    await service.transition(ID, MentorshipState.ARCHIVED, owner);

    await expect(service.transition(ID, MentorshipState.DRAFT, admin)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('does not overwrite a concurrent change', async () => {
    const { service, lifecycles, events } = setup();
    await service.start(ID);
    lifecycles.loseNextUpdate = true;

    await expect(service.transition(ID, MentorshipState.PUBLISHED, owner)).rejects.toBeInstanceOf(
      ResourceConflictException,
    );
    expect(lifecycles.rows[0].state).toBe(MentorshipState.DRAFT);
    expect(events.rows).toHaveLength(0);
  });

  it('does not record a change twice if the audit write is replayed', async () => {
    const { service, events } = setup();
    await service.start(ID);
    await service.transition(ID, MentorshipState.PUBLISHED, owner);
    // Simulate a replay of the same audit row (as after a crash and retry).
    await expect(
      events.create({ mentorshipId: ID, sequence: 1 }),
    ).rejects.toMatchObject({ code: 11000 });

    expect(events.rows).toHaveLength(1);
  });

  it('keeps separate mentorships separate', async () => {
    const { service } = setup();
    await service.start('a');
    await service.start('b');

    await service.transition('a', MentorshipState.PUBLISHED, owner);

    expect((await service.get('a')).state).toBe(MentorshipState.PUBLISHED);
    expect((await service.get('b')).state).toBe(MentorshipState.DRAFT);
    expect(await service.history('b')).toEqual([]);
  });
});
