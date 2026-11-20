import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { AuditService } from '../common/audit';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AuditContext } from '../common/audit';
import { PrivateNote, PrivateNoteSchema } from './schemas/private-note.schema';
import { ProjectNote, ProjectNoteSchema } from './schemas/project-note.schema';
import {
  ProjectResource,
  ProjectResourceSchema,
  ResourceAccessPolicy,
  ResourceKind,
} from './schemas/project-resource.schema';
import {
  ProjectWorkspace,
  ProjectWorkspaceSchema,
  WorkspaceRole,
} from './schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivitySchema,
} from './schemas/workspace-activity.schema';
import { PrivateNoteCipher } from './support/private-note-cipher';
import { PrivateNoteService } from './services/private-note.service';
import { ProjectNoteService } from './services/project-note.service';
import { ProjectWorkspaceService } from './services/project-workspace.service';
import { ResourceLibraryService } from './services/resource-library.service';
import { WorkspaceAccessService } from './services/workspace-access.service';

const audit: AuditContext = {
  actorId: 'owner-1',
  actorEmail: 'owner@example.com',
  actorRole: 'student',
  requestId: 'req-integration',
  ip: null,
  userAgent: null,
};

const checksum = 'b'.repeat(64);
const encryptionKey = Buffer.alloc(32, 11).toString('base64');

describe('project workspace integration (mongodb-memory-server)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let workspaces: ProjectWorkspaceService;
  let notes: ProjectNoteService;
  let privateNotes: PrivateNoteService;
  let resources: ResourceLibraryService;
  let workspaceModel: Model<unknown>;
  let privateNoteModel: Model<unknown>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: ProjectWorkspace.name, schema: ProjectWorkspaceSchema },
          { name: ProjectNote.name, schema: ProjectNoteSchema },
          { name: PrivateNote.name, schema: PrivateNoteSchema },
          { name: ProjectResource.name, schema: ProjectResourceSchema },
          { name: WorkspaceActivity.name, schema: WorkspaceActivitySchema },
        ]),
      ],
      providers: [
        WorkspaceAccessService,
        ProjectWorkspaceService,
        ProjectNoteService,
        PrivateNoteService,
        ResourceLibraryService,
        {
          provide: PrivateNoteCipher,
          useFactory: () =>
            new PrivateNoteCipher({
              get: (name: string) =>
                name === 'projectNotes.encryptionKey'
                  ? encryptionKey
                  : name === 'projectNotes.encryptionKeyId'
                    ? 'v1'
                    : undefined,
            } as ConfigService),
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    workspaces = moduleRef.get(ProjectWorkspaceService);
    notes = moduleRef.get(ProjectNoteService);
    privateNotes = moduleRef.get(PrivateNoteService);
    resources = moduleRef.get(ResourceLibraryService);
    workspaceModel = moduleRef.get(getModelToken(ProjectWorkspace.name));
    privateNoteModel = moduleRef.get(getModelToken(PrivateNote.name));
    await Promise.all([
      workspaceModel.init(),
      moduleRef.get<Model<unknown>>(getModelToken(ProjectNote.name)).init(),
      privateNoteModel.init(),
      moduleRef.get<Model<unknown>>(getModelToken(ProjectResource.name)).init(),
    ]);
  }, 120_000);

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (mongod) await mongod.stop();
  });

  async function createWorkspace(key: string, idempotencyKey?: string) {
    return (await workspaces.create('owner-1', audit, {
      tenantId: 'tenant-1',
      key,
      title: `Workspace ${key}`,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    })) as { id: string; version: number };
  }

  it('persists a workspace and replays an idempotent create once', async () => {
    const [first, second] = await Promise.all([
      createWorkspace('idem-ws', 'create-once'),
      createWorkspace('idem-ws', 'create-once'),
    ]);

    expect(second.id).toBe(first.id);
    expect(await workspaceModel.countDocuments({ key: 'idem-ws' })).toBe(1);
  });

  it('enforces tenant membership and optimistic versions on real documents', async () => {
    const workspace = await createWorkspace('scoped-ws');
    await expect(
      workspaces.findOne('outsider', workspace.id),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });

    await workspaces.addMember('owner-1', audit, workspace.id, {
      userId: 'viewer-1',
      role: WorkspaceRole.VIEWER,
    });
    await expect(
      workspaces.update('viewer-1', audit, workspace.id, {
        expectedVersion: 1,
        title: 'Not allowed',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });

    const latest = (await workspaces.findOne('owner-1', workspace.id)) as {
      version: number;
    };
    await expect(
      workspaces.update('owner-1', audit, workspace.id, {
        expectedVersion: latest.version - 1,
        title: 'Stale',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });
  });

  it('keeps private notes out of shared views and stores no plaintext', async () => {
    const workspace = await createWorkspace('notes-ws');
    await workspaces.addMember('owner-1', audit, workspace.id, {
      userId: 'viewer-1',
      role: WorkspaceRole.VIEWER,
    });

    const shared = await notes.create('owner-1', audit, workspace.id, {
      title: 'Shared',
      content: '**team** note',
    });
    const secret = await privateNotes.create('owner-1', audit, workspace.id, {
      title: 'Secret title',
      content: 'Secret body',
    });

    expect(
      (await notes.list('viewer-1', workspace.id)).map((n) => n.id),
    ).toEqual([shared.id]);
    expect(await privateNotes.list('viewer-1', workspace.id)).toEqual([]);
    await expect(
      privateNotes.findOne('viewer-1', workspace.id, secret.id as string),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.RES_WORKSPACE_PRIVATE_NOTE_NOT_FOUND,
    });

    const stored = await privateNoteModel.findById(secret.id).lean();
    const raw = JSON.stringify(stored);
    expect(raw).not.toContain('Secret title');
    expect(raw).not.toContain('Secret body');
    await expect(
      privateNotes.findOne('owner-1', workspace.id, secret.id as string),
    ).resolves.toMatchObject({ title: 'Secret title', content: 'Secret body' });
  });

  it('gates resource visibility on approval and access policy', async () => {
    const workspace = await createWorkspace('resources-ws');
    await workspaces.addMember('owner-1', audit, workspace.id, {
      userId: 'viewer-1',
      role: WorkspaceRole.VIEWER,
    });

    const submitted = await resources.submit('owner-1', audit, workspace.id, {
      kind: ResourceKind.FILE,
      name: 'Approved dataset',
      uri: 'datasets/approved.csv',
      checksumSha256: checksum,
      accessPolicy: ResourceAccessPolicy.TEAM,
    });
    expect(await resources.list('viewer-1', workspace.id)).toEqual([]);

    await resources.approve(
      'owner-1',
      audit,
      workspace.id,
      submitted.id as string,
      {
        expectedVersion: 1,
      },
    );
    const visible = await resources.list('viewer-1', workspace.id);
    expect(visible.map((r) => r.id)).toEqual([submitted.id]);
  });

  it('rejects unsafe note markup with a stable error code', async () => {
    const workspace = await createWorkspace('safe-render-ws');
    await expect(
      notes.create('owner-1', audit, workspace.id, {
        title: 'Unsafe',
        content: '<script>alert(1)</script>',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.VAL_WORKSPACE_UNSAFE_MARKUP,
    });
  });
});
