import { AuditContext } from '../../common/audit';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  WorkspaceFundingImpact,
  WorkspacePauseStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import { PrivateNoteCipher } from '../support/private-note-cipher';
import { ProjectWorkspaceService } from './project-workspace.service';

const auditContext: AuditContext = {
  actorId: 'owner-1',
  actorEmail: 'owner@example.com',
  actorRole: 'student',
  requestId: 'pause-request-1',
  ip: null,
  userAgent: null,
};

function query(result: unknown) {
  return { exec: jest.fn().mockResolvedValue(result) };
}

const activeWorkspace = () => ({
  _id: 'workspace-1',
  tenantId: 'tenant-1',
  status: WorkspaceStatus.ACTIVE,
  members: [{ userId: 'owner-1', role: WorkspaceRole.OWNER }],
  objectives: [],
  milestones: [],
  pauseHistory: [],
  deadlineAt: new Date('2030-01-01T00:00:00.000Z'),
  version: 3,
});

const cipher = new PrivateNoteCipher({
  get: (name: string) =>
    name === 'projectNotes.encryptionKey'
      ? Buffer.alloc(32, 19).toString('base64')
      : 'v1',
} as never);

describe('ProjectWorkspaceService pause lifecycle', () => {
  let workspaces: Record<string, jest.Mock>;
  let access: { load: jest.Mock; loadForMutation: jest.Mock };
  let audit: { record: jest.Mock };
  let events: { emit: jest.Mock };
  let service: ProjectWorkspaceService;

  beforeEach(() => {
    workspaces = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    access = {
      load: jest.fn().mockResolvedValue(activeWorkspace()),
      loadForMutation: jest.fn().mockResolvedValue(activeWorkspace()),
    };
    audit = { record: jest.fn().mockResolvedValue(null) };
    events = { emit: jest.fn() };
    service = new ProjectWorkspaceService(
      workspaces as never,
      { countDocuments: jest.fn().mockResolvedValue(0) } as never,
      { countDocuments: jest.fn().mockResolvedValue(0) } as never,
      { find: jest.fn().mockReturnValue(query([])) } as never,
      access as never,
      audit as never,
      events as never,
      cipher,
    );
  });

  it('stores a pause request without exposing its reason in the response or audit', async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    workspaces.findOneAndUpdate.mockReturnValue(
      query({
        ...activeWorkspace(),
        version: 4,
        pauseHistory: [
          {
            pauseId: 'pause-1',
            status: WorkspacePauseStatus.PENDING,
            requestedBy: 'owner-1',
            requestedAt: new Date(),
            expiresAt,
            reason: cipher.encrypt({
              title: 'project-pause-reason',
              content: 'Confidential circumstances',
            }),
            fundingImpact: WorkspaceFundingImpact.REVIEW_REQUIRED,
          },
        ],
      }),
    );

    const result = await service.requestPause(
      'owner-1',
      auditContext,
      'workspace-1',
      {
        reason: 'Confidential circumstances',
        expiresAt: expiresAt.toISOString(),
        expectedVersion: 3,
        idempotencyKey: 'pause-request',
      },
    );

    expect(result).not.toHaveProperty('pauseHistory');
    expect(result.pause).not.toHaveProperty('reason');
    expect(result.pause).toHaveProperty('hasReason', true);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      'Confidential circumstances',
    );
    const stored = workspaces.findOneAndUpdate.mock.calls[0][1].$push
      .pauseHistory;
    expect(JSON.stringify(stored)).not.toContain('Confidential circumstances');
    expect(stored.reason.ciphertext).toBeDefined();
  });

  it('reveals encrypted pause reasons only through the owner-only detail method', async () => {
    access.load.mockResolvedValueOnce({
      ...activeWorkspace(),
      pauseHistory: [
        {
          pauseId: 'pause-1',
          status: WorkspacePauseStatus.PENDING,
          requestedBy: 'owner-1',
          reason: cipher.encrypt({
            title: 'project-pause-reason',
            content: 'Private reviewer context',
          }),
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          fundingImpact: WorkspaceFundingImpact.REVIEW_REQUIRED,
        },
      ],
    });

    await expect(
      service.getPause('owner-1', 'workspace-1', 'pause-1'),
    ).resolves.toMatchObject({ reason: 'Private reviewer context' });
    expect(access.load.mock.calls[0][2]).toEqual([WorkspaceRole.OWNER]);
  });

  it('rejects pauses beyond the 90-day policy limit before writing', async () => {
    const expiresAt = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);

    await expect(
      service.requestPause('owner-1', auditContext, 'workspace-1', {
        reason: 'Temporary delay',
        expiresAt: expiresAt.toISOString(),
        expectedVersion: 3,
        idempotencyKey: 'pause-request',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_OUT_OF_RANGE });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects self-approval and does not change the workspace', async () => {
    access.load.mockResolvedValueOnce({
      ...activeWorkspace(),
      pauseHistory: [
        {
          pauseId: 'pause-1',
          status: WorkspacePauseStatus.PENDING,
          requestedBy: 'owner-1',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(
      service.decidePause('owner-1', auditContext, 'workspace-1', 'pause-1', {
        approved: true,
        expectedVersion: 3,
        idempotencyKey: 'pause-decision',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_PAUSE_SELF_APPROVAL,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects the generic status route from bypassing the pause approval flow', async () => {
    await expect(
      service.changeStatus('owner-1', auditContext, 'workspace-1', {
        status: WorkspaceStatus.ON_HOLD,
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('shifts project deadlines by the actual pause duration on resume', async () => {
    const pausedAt = new Date(Date.now() - 3_600_000);
    const dueAt = new Date('2030-02-01T00:00:00.000Z');
    access.load.mockResolvedValueOnce({
      ...activeWorkspace(),
      status: WorkspaceStatus.ON_HOLD,
      version: 4,
      pauseHistory: [
        {
          pauseId: 'pause-1',
          status: WorkspacePauseStatus.ACTIVE,
          requestedBy: 'owner-2',
          pausedAt,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          fundingImpact: WorkspaceFundingImpact.REVIEW_REQUIRED,
        },
      ],
      objectives: [
        { id: 'objective-1', title: 'Objective', status: 'planned', dueAt },
      ],
    });
    workspaces.findOneAndUpdate.mockReturnValue(
      query({
        ...activeWorkspace(),
        version: 5,
        status: WorkspaceStatus.ACTIVE,
      }),
    );

    await service.resume('owner-1', auditContext, 'workspace-1', {
      expectedVersion: 4,
      idempotencyKey: 'resume-request',
    });

    const update = workspaces.findOneAndUpdate.mock.calls[0][1] as {
      $set: Record<string, unknown>;
    };
    expect(new Date(update.$set.deadlineAt as Date).getTime()).toBeGreaterThan(
      activeWorkspace().deadlineAt.getTime(),
    );
    const objectives = update.$set.objectives as Array<{ dueAt: Date }>;
    expect(objectives[0].dueAt.getTime()).toBeGreaterThan(dueAt.getTime());
  });

  it('automatically resumes an expired pause and emits one metadata-only event', async () => {
    const expired = {
      ...activeWorkspace(),
      status: WorkspaceStatus.ON_HOLD,
      version: 4,
      pauseHistory: [
        {
          pauseId: 'pause-expired',
          status: WorkspacePauseStatus.ACTIVE,
          requestedBy: 'owner-2',
          reason: cipher.encrypt({
            title: 'project-pause-reason',
            content: 'Private expiry reason',
          }),
          pausedAt: new Date(Date.now() - 3_600_000),
          expiresAt: new Date(Date.now() - 1_000),
          fundingImpact: WorkspaceFundingImpact.REVIEW_REQUIRED,
        },
      ],
    };
    const findQuery = {
      limit: jest.fn(),
      exec: jest.fn().mockResolvedValue([expired]),
    };
    findQuery.limit.mockReturnValue(findQuery);
    workspaces.find.mockReturnValue(findQuery);
    workspaces.findOneAndUpdate.mockReturnValue(
      query({ ...expired, status: WorkspaceStatus.ACTIVE, version: 5 }),
    );

    await expect(service.processExpiredPauses()).resolves.toBe(1);

    expect(workspaces.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'project-workspace.pause.resumed',
      expect.objectContaining({
        eventId: 'pause-expired:resumed',
        outcome: 'expired',
        fundingImpact: WorkspaceFundingImpact.REVIEW_REQUIRED,
      }),
    );
    expect(JSON.stringify(events.emit.mock.calls)).not.toContain(
      'Private expiry reason',
    );
  });

  it('returns an actionable stale-version error and preserves dependency failures', async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    workspaces.findOneAndUpdate.mockReturnValue(query(null));
    workspaces.findById.mockReturnValue(
      query({ ...activeWorkspace(), version: 4 }),
    );

    await expect(
      service.requestPause('owner-1', auditContext, 'workspace-1', {
        reason: 'Temporary delay',
        expiresAt: expiresAt.toISOString(),
        expectedVersion: 3,
        idempotencyKey: 'pause-request',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });

    workspaces.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });
    await expect(
      service.requestPause('owner-1', auditContext, 'workspace-1', {
        reason: 'Temporary delay',
        expiresAt: expiresAt.toISOString(),
        expectedVersion: 3,
        idempotencyKey: 'pause-request-2',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
