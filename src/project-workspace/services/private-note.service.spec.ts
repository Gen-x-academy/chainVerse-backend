import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { AuditContext } from '../../common/audit';
import { PrivateNoteCipher } from '../support/private-note-cipher';
import { PrivateNoteService } from './private-note.service';

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
  };
  chain.sort.mockReturnValue(chain);
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

const key = Buffer.alloc(32, 3).toString('base64');
const config = {
  get: (name: string) =>
    name === 'projectNotes.encryptionKey'
      ? key
      : name === 'projectNotes.encryptionKeyId'
        ? 'v1'
        : undefined,
} as ConfigService;

describe('PrivateNoteService', () => {
  let notes: Record<string, jest.Mock>;
  let access: { load: jest.Mock; loadForMutation: jest.Mock };
  let audit: { record: jest.Mock };
  let service: PrivateNoteService;

  beforeEach(() => {
    notes = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    access = {
      load: jest.fn().mockResolvedValue(workspace),
      loadForMutation: jest.fn().mockResolvedValue(workspace),
    };
    audit = { record: jest.fn().mockResolvedValue(null) };
    service = new PrivateNoteService(
      notes as never,
      access as never,
      new PrivateNoteCipher(config),
      audit as never,
      { emit: jest.fn() } as never,
    );
  });

  it('encrypts title and body so stored data contains no plaintext', async () => {
    notes.create.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'private-1',
      ...payload,
    }));

    const created = await service.create('u1', auditContext, 'ws-1', {
      title: 'Secret hypothesis',
      content: 'Private researcher body',
    });

    const stored = JSON.stringify(callsOf(notes.create)[0][0]);
    expect(stored).not.toContain('Secret hypothesis');
    expect(stored).not.toContain('Private researcher body');
    expect(created).not.toHaveProperty('title');
    expect(created).not.toHaveProperty('content');
    expect(created).not.toHaveProperty('ciphertext');
    expect(created).not.toHaveProperty('iv');
    expect(created).not.toHaveProperty('authTag');

    notes.findOne.mockReturnValue(query(callsOf(notes.create)[0][0]));
    await expect(
      service.findOne('u1', 'ws-1', 'private-1'),
    ).resolves.toMatchObject({
      title: 'Secret hypothesis',
      content: 'Private researcher body',
    });

    const entry = callsOf(audit.record)[0][0] as {
      after: Record<string, unknown>;
    };
    expect(JSON.stringify(entry.after)).not.toContain('Secret hypothesis');
  });

  it('scopes every list and lookup to the note owner', async () => {
    notes.find.mockReturnValue(query([]));
    await service.list('u1', 'ws-1');
    expect(callsOf(notes.find)[0][0]).toMatchObject({
      ownerId: 'u1',
      archivedAt: null,
    });

    notes.findOne.mockReturnValue(query(null));
    await expect(
      service.findOne('u2', 'ws-1', 'private-1'),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.RES_WORKSPACE_PRIVATE_NOTE_NOT_FOUND,
    });
    expect(callsOf(notes.findOne)[0][0]).toMatchObject({ ownerId: 'u2' });
  });

  it('rejects a stale private note update before re-encrypting', async () => {
    notes.findOne.mockReturnValue(
      query({
        _id: 'private-1',
        tenantId: 'tenant-1',
        projectId: 'ws-1',
        ownerId: 'u1',
        ciphertext: 'a',
        iv: 'b',
        authTag: 'c',
        keyId: 'v1',
        algorithm: 'aes-256-gcm',
        version: 4,
        archivedAt: null,
      }),
    );

    await expect(
      service.update('u1', auditContext, 'ws-1', 'private-1', {
        expectedVersion: 1,
        title: 'new',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });
    expect(notes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('exposes DomainException error codes for privacy failures', () => {
    expect(
      new PrivateNoteCipher({
        get: () => undefined,
      } as unknown as ConfigService),
    ).toBeInstanceOf(PrivateNoteCipher);
    try {
      new PrivateNoteCipher({
        get: () => undefined,
      } as unknown as ConfigService).encrypt({
        title: 't',
        content: 'c',
      });
    } catch (error) {
      expect((error as DomainException).errorCode).toBe(
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTES_DISABLED,
      );
    }
  });
});
