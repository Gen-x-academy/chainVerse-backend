import { Types } from 'mongoose';
import { MentorProfileService } from './mentor-profile.service';
import {
  MentorProfileRevisionAction,
  MentorProfileStatus,
  MentorProfileVisibility,
} from './schemas/mentor-profile.schema';
import {
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { UpsertMentorProfileDto } from './dto/upsert-mentor-profile.dto';

/** Minimal in-memory stand-ins for the two Mongoose models the service uses. */
class FakeProfiles {
  rows: any[] = [];
  /** Lets a test make the next updateOne lose the race. */
  failNextUpdate = false;

  findOne = (filter: { userId: string }) => ({
    exec: async () => this.rows.find((r) => r.userId === filter.userId) ?? null,
  });
  findById = (id: unknown) => ({
    exec: async () => this.rows.find((r) => String(r._id) === String(id)) ?? null,
  });
  create = async (doc: Record<string, any>) => {
    if (this.rows.some((r) => r.userId === doc.userId)) {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    const row = { _id: new Types.ObjectId(), createdAt: new Date(), ...doc };
    this.rows.push(row);
    return row;
  };
  updateOne = async (filter: { _id: unknown; revision: number }, update: { $set: Record<string, any> }) => {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      return { modifiedCount: 0 };
    }
    const row = this.rows.find(
      (r) => String(r._id) === String(filter._id) && r.revision === filter.revision,
    );
    if (!row) return { modifiedCount: 0 };
    Object.assign(row, update.$set);
    return { modifiedCount: 1 };
  };
}

class FakeRevisions {
  rows: any[] = [];
  create = async (doc: Record<string, any>) => {
    if (this.rows.some((r) => r.profileId === doc.profileId && r.revision === doc.revision)) {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    this.rows.push({ createdAt: new Date(), ...doc });
    return doc;
  };
  find = (filter: { userId: string }) => {
    let result = this.rows.filter((r) => r.userId === filter.userId);
    const chain = {
      sort: (order: { revision: number }) => {
        result = [...result].sort((a, b) => (a.revision - b.revision) * order.revision);
        return chain;
      },
      limit: (n: number) => {
        result = result.slice(0, n);
        return chain;
      },
      exec: async () => result,
    };
    return chain;
  };
}

const OWNER = 'mentor-1';
const VIEWER = 'viewer-1';

const complete: UpsertMentorProfileDto = {
  headline: 'Backend engineer',
  bio: 'I teach systems programming.',
  expertise: ['Rust', 'Distributed systems'],
  languages: ['en', 'yo'],
  timeZone: 'Africa/Lagos',
  yearsOfExperience: 8,
  teachingApproach: 'Pair on real problems.',
  links: [{ label: 'Site', url: 'https://example.com' }],
};

function setup() {
  const profiles = new FakeProfiles();
  const revisions = new FakeRevisions();
  const service = new MentorProfileService(profiles as never, revisions as never);
  return { service, profiles, revisions };
}

describe('MentorProfileService drafts', () => {
  it('creates a draft profile on first save', async () => {
    const { service, revisions } = setup();

    const view = await service.saveDraft(OWNER, complete);

    expect(view.status).toBe(MentorProfileStatus.DRAFT);
    expect(view.revision).toBe(1);
    expect(view.published).toBeNull();
    expect(view.draft.headline).toBe('Backend engineer');
    expect(revisions.rows).toHaveLength(1);
    expect(revisions.rows[0].action).toBe(MentorProfileRevisionAction.DRAFT_SAVED);
  });

  it('accepts a partial draft and reports what publishing still needs', async () => {
    const { service } = setup();

    const view = await service.saveDraft(OWNER, { headline: 'Just starting' });

    expect(view.missingForPublish).toEqual(['bio', 'expertise', 'languages', 'timeZone']);
  });

  it('normalises text and removes duplicate list entries', async () => {
    const { service } = setup();

    const view = await service.saveDraft(OWNER, {
      ...complete,
      headline: '  Padded  ',
      expertise: ['Rust', 'rust ', ' ', 'Go'],
    });

    expect(view.draft.headline).toBe('Padded');
    expect(view.draft.expertise).toEqual(['Rust', 'Go']);
  });

  it('rejects an unknown time zone', async () => {
    const { service, profiles } = setup();

    await expect(
      service.saveDraft(OWNER, { ...complete, timeZone: 'Mars/Olympus' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_INVALID_FORMAT });
    expect(profiles.rows).toHaveLength(0);
  });

  it('is idempotent: saving the same draft again writes no new revision', async () => {
    const { service, revisions } = setup();

    await service.saveDraft(OWNER, complete);
    const again = await service.saveDraft(OWNER, complete);

    expect(again.revision).toBe(1);
    expect(revisions.rows).toHaveLength(1);
  });

  it('records a new revision when the draft really changes', async () => {
    const { service, revisions } = setup();

    await service.saveDraft(OWNER, complete);
    const changed = await service.saveDraft(OWNER, { ...complete, headline: 'Changed' });

    expect(changed.revision).toBe(2);
    expect(revisions.rows.map((r) => r.revision)).toEqual([1, 2]);
  });

  it('treats a save as a full replace: omitted fields return to their defaults', async () => {
    const { service } = setup();

    await service.saveDraft(OWNER, complete);
    const replaced = await service.saveDraft(OWNER, { headline: 'Only this' });

    expect(replaced.draft.bio).toBe('');
    expect(replaced.draft.expertise).toEqual([]);
  });

  it('survives losing the race to create the first profile', async () => {
    const { service, profiles } = setup();
    const realCreate = profiles.create;
    let first = true;
    profiles.create = async (doc: Record<string, any>) => {
      if (first) {
        first = false;
        await realCreate({ ...doc, draft: { ...doc.draft, headline: 'Other request' } });
      }
      return realCreate(doc);
    };

    const view = await service.saveDraft(OWNER, complete);

    expect(profiles.rows).toHaveLength(1);
    expect(view.draft.headline).toBe('Backend engineer');
    expect(view.revision).toBe(2);
  });

  it('refuses to overwrite a change made by a concurrent request', async () => {
    const { service, profiles } = setup();
    await service.saveDraft(OWNER, complete);
    profiles.failNextUpdate = true;

    await expect(
      service.saveDraft(OWNER, { ...complete, headline: 'Lost the race' }),
    ).rejects.toBeInstanceOf(ResourceConflictException);
    expect(profiles.rows[0].draft.headline).toBe('Backend engineer');
  });
});

describe('MentorProfileService publishing', () => {
  it('cannot publish an incomplete draft and names what is missing', async () => {
    const { service } = setup();
    await service.saveDraft(OWNER, { headline: 'Incomplete' });

    const attempt = service.publish(OWNER);

    await expect(attempt).rejects.toBeInstanceOf(ValidationDomainException);
    await expect(attempt).rejects.toMatchObject({
      errorCode: ErrorCode.VAL_MENTOR_PROFILE_INCOMPLETE,
    });
  });

  it('cannot publish before any draft exists', async () => {
    const { service } = setup();

    await expect(service.publish(OWNER)).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('publishes a snapshot of the draft', async () => {
    const { service, revisions } = setup();
    await service.saveDraft(OWNER, complete);

    const view = await service.publish(OWNER);

    expect(view.status).toBe(MentorProfileStatus.PUBLISHED);
    expect(view.published?.headline).toBe('Backend engineer');
    expect(view.hasUnpublishedChanges).toBe(false);
    expect(revisions.rows.at(-1).action).toBe(MentorProfileRevisionAction.PUBLISHED);
  });

  it('is idempotent: publishing an unchanged published profile adds no revision', async () => {
    const { service, revisions } = setup();
    await service.saveDraft(OWNER, complete);
    await service.publish(OWNER);
    const count = revisions.rows.length;

    const again = await service.publish(OWNER);

    expect(again.revision).toBe(2);
    expect(revisions.rows).toHaveLength(count);
  });

  it('keeps the published copy unchanged while the draft is edited', async () => {
    const { service } = setup();
    await service.saveDraft(OWNER, complete);
    await service.publish(OWNER);

    const edited = await service.saveDraft(OWNER, { ...complete, headline: 'Edited draft' });

    expect(edited.published?.headline).toBe('Backend engineer');
    expect(edited.draft.headline).toBe('Edited draft');
    expect(edited.hasUnpublishedChanges).toBe(true);
  });

  it('unpublishes, keeps the draft, and is a no-op the second time', async () => {
    const { service, revisions } = setup();
    await service.saveDraft(OWNER, complete);
    await service.publish(OWNER);

    const view = await service.unpublish(OWNER);
    const count = revisions.rows.length;
    const again = await service.unpublish(OWNER);

    expect(view.status).toBe(MentorProfileStatus.DRAFT);
    expect(view.published).toBeNull();
    expect(view.draft.headline).toBe('Backend engineer');
    expect(again.revision).toBe(view.revision);
    expect(revisions.rows).toHaveLength(count);
  });
});

describe('MentorProfileService viewing', () => {
  async function published(overrides: Partial<UpsertMentorProfileDto> = {}) {
    const ctx = setup();
    const draft = await ctx.service.saveDraft(OWNER, { ...complete, ...overrides });
    await ctx.service.publish(OWNER);
    return { ...ctx, id: draft.id };
  }

  it('shows another signed-in user only the permitted fields', async () => {
    const { service, id } = await published();

    const view = await service.getVisible(id, VIEWER);

    expect(view).toEqual({
      id,
      headline: 'Backend engineer',
      bio: 'I teach systems programming.',
      expertise: ['Rust', 'Distributed systems'],
      languages: ['en', 'yo'],
      timeZone: 'Africa/Lagos',
      yearsOfExperience: 8,
      teachingApproach: 'Pair on real problems.',
      links: [{ label: 'Site', url: 'https://example.com' }],
    });
    expect(view).not.toHaveProperty('userId');
    expect(view).not.toHaveProperty('visibility');
  });

  it('shows the published copy, not the unpublished draft', async () => {
    const { service, id } = await published();
    await service.saveDraft(OWNER, { ...complete, headline: 'Not yet public' });

    expect((await service.getVisible(id, VIEWER)).headline).toBe('Backend engineer');
  });

  it('hides a profile that was never published', async () => {
    const { service } = setup();
    const draft = await service.saveDraft(OWNER, complete);

    await expect(service.getVisible(draft.id, VIEWER)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('hides an unpublished profile', async () => {
    const { service, id } = await published();
    await service.unpublish(OWNER);

    await expect(service.getVisible(id, VIEWER)).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('hides a private profile from others but not from its owner', async () => {
    const { service, id } = await published({ visibility: MentorProfileVisibility.PRIVATE });

    await expect(service.getVisible(id, VIEWER)).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(service.getVisible(id, OWNER)).resolves.toMatchObject({ id });
  });

  it('answers an unknown id the same way as a hidden one', async () => {
    const { service } = setup();

    await expect(
      service.getVisible(new Types.ObjectId().toString(), VIEWER),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});

describe('MentorProfileService revisions and ownership', () => {
  it('lists the owner history newest first and caps the page size', async () => {
    const { service } = setup();
    await service.saveDraft(OWNER, complete);
    await service.saveDraft(OWNER, { ...complete, headline: 'Two' });
    await service.publish(OWNER);

    const history = await service.listRevisions(OWNER);

    expect(history.map((h) => h.revision)).toEqual([3, 2, 1]);
    expect(history.map((h) => h.action)).toEqual([
      MentorProfileRevisionAction.PUBLISHED,
      MentorProfileRevisionAction.DRAFT_SAVED,
      MentorProfileRevisionAction.DRAFT_SAVED,
    ]);
    await expect(service.listRevisions(OWNER, 1)).resolves.toHaveLength(1);
  });

  it("never exposes one user's revisions or profile to another", async () => {
    const { service } = setup();
    await service.saveDraft(OWNER, complete);

    await expect(service.listRevisions('someone-else')).resolves.toEqual([]);
    await expect(service.getOwn('someone-else')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
