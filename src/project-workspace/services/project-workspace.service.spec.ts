import {
  ForbiddenDomainException,
  DomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { AuditContext } from '../../common/audit';
import { CreateWorkspaceDto } from '../dto/project-workspace.dto';
import {
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import { ProjectWorkspaceService } from './project-workspace.service';

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
  key: 'capstone',
  title: 'Capstone workspace',
  status: WorkspaceStatus.ACTIVE,
  members: [{ userId: 'u1', role: WorkspaceRole.OWNER }],
  objectives: [],
  milestones: [],
  nextActions: [],
  version: 3,
  idempotencyKey: null,
};

const createDto: CreateWorkspaceDto = {
  tenantId: 'tenant-1',
  key: 'capstone',
  title: 'Capstone workspace',
  idempotencyKey: 'create-1',
};

describe('ProjectWorkspaceService', () => {
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
      load: jest.fn().mockResolvedValue(workspace),
      loadForMutation: jest
        .fn()
        .mockImplementation(() => access.load()),
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
      { encrypt: jest.fn(), decrypt: jest.fn() } as never,
    );
  });

  it('returns the original workspace for an idempotent create replay', async () => {
    workspaces.findOne.mockReturnValue(
      query({ ...workspace, idempotencyKey: 'create-1' }),
    );

    const result = await service.create('u1', auditContext, createDto);

    expect(result.id).toBe('ws-1');
    expect(result).not.toHaveProperty('idempotencyKey');
    expect(workspaces.create).not.toHaveBeenCalled();
  });

  it('denies updates to callers without an allowed role', async () => {
    access.load.mockRejectedValueOnce(
      new ForbiddenDomainException(
        'denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      ),
    );
    access.loadForMutation.mockRejectedValueOnce(
      new ForbiddenDomainException(
        'denied',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      ),
    );

    await expect(
      service.update('viewer', auditContext, 'ws-1', {
        expectedVersion: 3,
        nextActions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a stale write instead of overwriting a concurrent update', async () => {
    workspaces.findOneAndUpdate.mockReturnValue(query(null));
    workspaces.findById.mockReturnValue(query({ ...workspace, version: 9 }));

    await expect(
      service.update('u1', auditContext, 'ws-1', {
        expectedVersion: 3,
        title: 'Changed',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });
  });

  it('rejects an invalid lifecycle transition before writing', async () => {
    access.loadForMutation.mockResolvedValueOnce({
      ...workspace,
      status: WorkspaceStatus.DRAFT,
    });

    await expect(
      service.changeStatus('u1', auditContext, 'ws-1', {
        status: WorkspaceStatus.COMPLETED,
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_CLOSURE_REQUIRED,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects duplicate membership without duplicating the side effect', async () => {
    await expect(
      service.addMember('u1', auditContext, 'ws-1', {
        userId: 'u1',
        role: WorkspaceRole.EDITOR,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_MEMBER_CONFLICT,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('records audit metadata without persisting workspace payloads', async () => {
    workspaces.create.mockResolvedValue({ ...workspace });
    const created = await service.create('u1', auditContext, {
      ...createDto,
      idempotencyKey: undefined,
    });

    expect(created.id).toBe('ws-1');
    const entry = callsOf(audit.record)[0][0] as {
      after: Record<string, unknown>;
    };
    expect(entry.after).not.toHaveProperty('title');
    expect(entry.after).toHaveProperty('key', 'capstone');
    expect(
      (callsOf(events.emit)[0][1] as { projectId: string }).projectId,
    ).toBe('ws-1');
  });

  it('exposes a stable errorCode on domain failures', async () => {
    try {
      await service.changeStatus('u1', auditContext, 'ws-1', {
        status: WorkspaceStatus.DRAFT,
        expectedVersion: 3,
      });
    } catch (error) {
      expect((error as DomainException).errorCode).toBeDefined();
    }
  });
});
