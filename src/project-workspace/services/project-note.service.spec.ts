import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { AuditContext } from '../../common/audit';
import { ProjectNoteService } from './project-note.service';

const auditContext: AuditContext = {
  actorId: 'u1',
  actorEmail: 'u1@example.com',
  actorRole: 'student',
  requestId: 'req-1',
  ip: null,
  userAgent: null,
};

function query(result: unknown) {
  const chain: Record<string, jest.Mock> = {
    exec: jest.fn().mockResolvedValue(result),
    sort: jest.fn(),
    limit: jest.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function callsOf(mock: jest.Mock): unknown[][] {
  return mock.mock.calls as unknown[][];
}

const workspace = {
  _id: 'ws-1',
  tenantId: 'tenant-1',
  members: [{ userId: 'u1', role: 'owner' }],
};

const note = {
  _id: 'note-1',
  tenantId: 'tenant-1',
  projectId: 'ws-1',
  authorId: 'u1',
  lastEditorId: 'u1',
  title: 'Design notes',
  source: '**safe**',
  content: '<strong>safe</strong>',
  status: 'draft',
  linkedNoteIds: [],
  revisions: [],
  version: 1,
  idempotencyKey: null,
};

describe('ProjectNoteService', () => {
  let notes: Record<string, jest.Mock>;
  let access: { load: jest.Mock; loadForMutation: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ProjectNoteService;

  beforeEach(() => {
    notes = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    notes.findOne.mockReturnValue(query(null));
    notes.find.mockReturnValue(query([]));
    access = {
      load: jest.fn().mockResolvedValue(workspace),
      loadForMutation: jest.fn().mockResolvedValue(workspace),
    };
    audit = { record: jest.fn().mockResolvedValue(null) };
    service = new ProjectNoteService(
      notes as never,
      access as never,
      audit as never,
      { emit: jest.fn() } as never,
    );
  });

  it('rejects unsafe note markup before any persistence', async () => {
    await expect(
      service.create('u1', auditContext, 'ws-1', {
        title: 'Unsafe',
        content: '<script>alert(1)</script>',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.VAL_WORKSPACE_UNSAFE_MARKUP,
    });
    expect(notes.create).not.toHaveBeenCalled();
  });

  it('stores rendered HTML and omits source and idempotency keys from summaries', async () => {
    notes.create.mockResolvedValue({
      ...note,
      source: '**safe**',
      content: '<strong>safe</strong>',
      idempotencyKey: 'idem-1',
    });

    const created = await service.create('u1', auditContext, 'ws-1', {
      title: 'Design notes',
      content: '**safe**',
      idempotencyKey: 'idem-1',
    });

    expect((callsOf(notes.create)[0][0] as { content: string }).content).toBe(
      '<strong>safe</strong>',
    );
    expect(created.content).toBe('<strong>safe</strong>');
    expect(created.source).toBe('**safe**');
    const listed = await service.list('u1', 'ws-1');
    expect(listed).toEqual([]);
    notes.find.mockReturnValue(query([note]));
    const summaries = await service.list('u1', 'ws-1');
    expect(summaries[0]).not.toHaveProperty('source');
    expect(summaries[0]).not.toHaveProperty('idempotencyKey');
  });

  it('excludes archived notes unless explicitly requested', async () => {
    notes.find.mockReturnValue(query([]));
    await service.list('u1', 'ws-1');
    expect(callsOf(notes.find)[0][0]).toMatchObject({
      status: { $ne: 'archived' },
    });
    await service.list('u1', 'ws-1', true);
    expect(callsOf(notes.find)[1][0]).not.toHaveProperty('status');
  });

  it('returns a stable revision conflict for a stale update', async () => {
    notes.findOne.mockReturnValue(query(note));
    notes.findOneAndUpdate.mockReturnValue(query(null));

    await expect(
      service.update('u1', auditContext, 'ws-1', 'note-1', {
        expectedVersion: 1,
        title: 'New title',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_NOTE_REVISION_CONFLICT,
    });
    expect(audit.record.mock.calls.length).toBe(0);
  });

  it('records revisions with the previous editor and version', async () => {
    notes.findOne.mockReturnValue(query(note));
    notes.findOneAndUpdate.mockReturnValue(query({ ...note, version: 2 }));

    await service.update('u1', auditContext, 'ws-1', 'note-1', {
      expectedVersion: 1,
      content: 'changed',
    });

    const update = callsOf(notes.findOneAndUpdate)[0][1] as {
      $push: { revisions: { editorId: string; version: number } };
    };
    expect(update.$push.revisions).toMatchObject({
      editorId: 'u1',
      version: 1,
    });
  });

  it('wraps pure rule failures in a DomainException', async () => {
    try {
      await service.create('u1', auditContext, 'ws-1', {
        title: 'Unsafe',
        content: '[x](javascript:alert(1))',
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as DomainException).errorCode).toBe(
        ErrorCode.VAL_WORKSPACE_UNSAFE_MARKUP,
      );
    }
  });
});
