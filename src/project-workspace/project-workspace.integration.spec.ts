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
  ClosureConsentDecision,
  ObjectiveStatus,
  ProjectClosureOutcome,
  ProjectClosureReason,
  ProjectWorkspace,
  ProjectWorkspaceSchema,
  WorkspaceRole,
  WorkspaceStatus,
} from './schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivitySchema,
} from './schemas/workspace-activity.schema';
import { PrivateNoteCipher } from './support/private-note-cipher';
import { PrivateNoteService } from './services/private-note.service';
import { ProjectNoteService } from './services/project-note.service';
import { ProjectWorkspaceService } from './services/project-workspace.service';
import { ProjectClosureService } from './services/project-closure.service';
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
  let closures: ProjectClosureService;
  let workspaceModel: Model<unknown>;
  let privateNoteModel: Model<unknown>;
  let activityModel: Model<unknown>;

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
        ProjectClosureService,
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
    closures = moduleRef.get(ProjectClosureService);
    notes = moduleRef.get(ProjectNoteService);
    privateNotes = moduleRef.get(PrivateNoteService);
    resources = moduleRef.get(ResourceLibraryService);
    workspaceModel = moduleRef.get(getModelToken(ProjectWorkspace.name));
    privateNoteModel = moduleRef.get(getModelToken(PrivateNote.name));
    activityModel = moduleRef.get(getModelToken(WorkspaceActivity.name));
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

  it('completes only finished projects and replays closure requests once', async () => {
    const workspace = await createWorkspace('completed-project');
    await workspaces.update('owner-1', audit, workspace.id, {
      expectedVersion: 1,
      objectives: [
        {
          id: 'objective-1',
          title: 'Deliver the research result',
          status: ObjectiveStatus.DONE,
        },
      ],
      milestones: [
        { id: 'milestone-1', title: 'Final review', complete: true },
      ],
    });
    await workspaces.changeStatus('owner-1', audit, workspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 2,
    });
    await expect(
      workspaces.changeStatus('owner-1', audit, workspace.id, {
        status: WorkspaceStatus.COMPLETED,
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_CLOSURE_REQUIRED,
    });
    const request = {
      reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
      expectedVersion: 3,
      idempotencyKey: 'close-complete-1',
    } as const;

    const first = await closures.close(
      'owner-1',
      'student',
      audit,
      workspace.id,
      request,
    );
    const replay = await closures.close(
      'owner-1',
      'student',
      audit,
      workspace.id,
      request,
    );

    expect(first).toMatchObject({
      status: WorkspaceStatus.COMPLETED,
      closure: {
        reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
        outcome: ProjectClosureOutcome.COMPLETED,
      },
    });
    expect(replay).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('requestHash');
    expect(JSON.stringify(first)).not.toContain('close-complete-1');
    await expect(
      closures.close(
        'owner-1',
        'moderator',
        audit,
        workspace.id,
        { ...request, reason: ProjectClosureReason.POLICY_ACTION },
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
    });
    await expect(
      notes.create('owner-1', audit, workspace.id, {
        title: 'After closure',
        content: 'This write must be rejected',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_CLOSED,
    });
  });

  it('requires unanimous consent and deduplicates concurrent retries', async () => {
    const workspace = await createWorkspace('mutual-termination');
    await workspaces.addMember('owner-1', audit, workspace.id, {
      userId: 'member-2',
      role: WorkspaceRole.EDITOR,
    });
    await workspaces.changeStatus('owner-1', audit, workspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 2,
    });
    const proposalRequest = {
      reason: ProjectClosureReason.MUTUAL_TERMINATION,
      expectedVersion: 3,
      idempotencyKey: 'close-mutual-1',
    } as const;
    const proposal = await closures.close(
      'owner-1',
      'student',
      audit,
      workspace.id,
      proposalRequest,
    );
    expect(proposal.terminationProposal).toMatchObject({
      consentsReceived: 1,
      consentsRequired: 2,
    });
    await expect(
      workspaces.addMember('owner-1', audit, workspace.id, {
        userId: 'late-member',
        role: WorkspaceRole.VIEWER,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_CLOSURE_PENDING,
    });

    const consent = {
      decision: ClosureConsentDecision.ACCEPT,
      expectedVersion: 4,
      idempotencyKey: 'consent-member-2',
    } as const;
    const auditRecord = moduleRef.get(AuditService).record as jest.Mock;
    const eventEmit = moduleRef.get(EventEmitter2).emit as jest.Mock;
    const auditCallsBefore = auditRecord.mock.calls.length;
    const eventCallsBefore = eventEmit.mock.calls.length;
    const [closed, replay] = await Promise.all([
      closures.consent('member-2', audit, workspace.id, consent),
      closures.consent('member-2', audit, workspace.id, consent),
    ]);

    expect(closed.status).toBe(WorkspaceStatus.ARCHIVED);
    expect(closed.closure).toMatchObject({
      reason: ProjectClosureReason.MUTUAL_TERMINATION,
      outcome: ProjectClosureOutcome.MUTUALLY_TERMINATED,
    });
    expect(replay).toEqual(closed);
    expect(auditRecord.mock.calls.length - auditCallsBefore).toBe(1);
    expect(eventEmit.mock.calls.length - eventCallsBefore).toBe(1);
    const stored = await workspaceModel.findById(workspace.id).lean();
    expect(JSON.stringify(stored)).toContain('consent-member-2');
  });

  it('denies unauthorized closure and rejects incomplete or stale completion', async () => {
    const workspace = await createWorkspace('invalid-completion');
    await workspaces.update('owner-1', audit, workspace.id, {
      expectedVersion: 1,
      objectives: [
        {
          id: 'objective-1',
          title: 'Still in progress',
          status: ObjectiveStatus.IN_PROGRESS,
        },
      ],
    });
    await workspaces.changeStatus('owner-1', audit, workspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 2,
    });

    await expect(
      closures.close('outsider', 'admin', audit, workspace.id, {
        reason: ProjectClosureReason.POLICY_ACTION,
        expectedVersion: 3,
        idempotencyKey: 'policy-unauthorized-1',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });
    await expect(
      closures.close('owner-1', 'student', audit, workspace.id, {
        reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
        expectedVersion: 3,
        idempotencyKey: 'close-incomplete-1',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_COMPLETION_INCOMPLETE,
    });
    await expect(
      closures.close('owner-1', 'student', audit, workspace.id, {
        reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
        expectedVersion: 1,
        idempotencyKey: 'close-stale-0001',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });
  });

  it('limits policy closure and sponsor withdrawal to authorized members', async () => {
    const policyWorkspace = await createWorkspace('policy-closure');
    await workspaces.changeStatus('owner-1', audit, policyWorkspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 1,
    });
    const policyResult = await closures.close(
      'owner-1',
      'moderator',
      audit,
      policyWorkspace.id,
      {
        reason: ProjectClosureReason.POLICY_ACTION,
        expectedVersion: 2,
        idempotencyKey: 'close-policy-1',
      },
    );
    expect(policyResult.closure).toMatchObject({
      reason: ProjectClosureReason.POLICY_ACTION,
      outcome: ProjectClosureOutcome.TERMINATED_BY_POLICY,
    });

    const sponsorWorkspace = await createWorkspace('sponsor-withdrawal');
    await workspaces.addMember('owner-1', audit, sponsorWorkspace.id, {
      userId: 'sponsor-1',
      role: WorkspaceRole.SPONSOR,
    });
    await workspaces.changeStatus('owner-1', audit, sponsorWorkspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 2,
    });
    const sponsorResult = await closures.close(
      'sponsor-1',
      'sponsor',
      audit,
      sponsorWorkspace.id,
      {
        reason: ProjectClosureReason.SPONSOR_WITHDRAWAL,
        expectedVersion: 3,
        idempotencyKey: 'close-sponsor-1',
      },
    );
    expect(sponsorResult.closure).toMatchObject({
      reason: ProjectClosureReason.SPONSOR_WITHDRAWAL,
      outcome: ProjectClosureOutcome.TERMINATED_BY_SPONSOR,
    });
    await expect(
      closures.close('owner-1', 'student', audit, sponsorWorkspace.id, {
        reason: ProjectClosureReason.SPONSOR_WITHDRAWAL,
        expectedVersion: 3,
        idempotencyKey: 'close-sponsor-denied',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    });
  });

  it('closes inactive projects and propagates activity-store failures', async () => {
    const now = new Date('2026-11-21T00:00:00.000Z');
    const workspace = await createWorkspace('inactive-project');
    await workspaces.changeStatus('owner-1', audit, workspace.id, {
      status: WorkspaceStatus.ACTIVE,
      expectedVersion: 1,
    });
    const old = new Date(now.getTime() - 91 * 86_400_000);
    await workspaceModel.updateOne(
      { _id: workspace.id },
      { $set: { updatedAt: old } },
      { timestamps: false },
    );

    const findOneSpy = jest
      .spyOn(activityModel, 'findOne')
      .mockImplementationOnce(() => {
        throw new Error('activity store unavailable');
      });
    await expect(closures.closeInactiveProjects(now)).rejects.toThrow(
      'activity store unavailable',
    );
    findOneSpy.mockRestore();

    expect(await closures.closeInactiveProjects(now)).toBe(1);
    expect(await closures.closeInactiveProjects(now)).toBe(0);
    await expect(
      workspaces.findOne('owner-1', workspace.id),
    ).resolves.toMatchObject({
      status: WorkspaceStatus.ARCHIVED,
      closure: {
        reason: ProjectClosureReason.INACTIVITY,
        outcome: ProjectClosureOutcome.TERMINATED_FOR_INACTIVITY,
      },
    });
  });
});
