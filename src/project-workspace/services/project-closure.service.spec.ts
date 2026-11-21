import { createHash } from 'node:crypto';
import { ForbiddenDomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { CloseProjectDto } from '../dto/project-workspace.dto';
import {
  ObjectiveStatus,
  ProjectClosureReason,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import { ProjectClosureService } from './project-closure.service';

const audit = {
  actorId: 'owner-1',
  actorEmail: null,
  actorRole: 'student',
  requestId: 'req-1',
  ip: null,
  userAgent: null,
};

const request: CloseProjectDto = {
  reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
  expectedVersion: 3,
  idempotencyKey: 'close-project-01',
};

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'workspace-1',
    tenantId: 'tenant-1',
    status: WorkspaceStatus.ACTIVE,
    version: 3,
    members: [{ userId: 'owner-1', role: WorkspaceRole.OWNER }],
    objectives: [{ status: ObjectiveStatus.DONE }],
    milestones: [{ complete: true }],
    closure: null,
    terminationProposal: null,
    ...overrides,
  };
}

function requestHash(actorId: string, dto: CloseProjectDto): string {
  return createHash('sha256')
    .update(
      `${actorId}|${dto.reason}|${dto.expectedVersion}|${dto.idempotencyKey}`,
    )
    .digest('hex');
}

describe('ProjectClosureService', () => {
  let service: ProjectClosureService;
  let access: { load: jest.Mock };
  let workspaces: { findOneAndUpdate: jest.Mock; findById: jest.Mock };
  let auditService: { record: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(() => {
    access = { load: jest.fn().mockResolvedValue(workspace()) };
    workspaces = {
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(null) };
    events = { emit: jest.fn() };
    service = new ProjectClosureService(
      workspaces as never,
      {} as never,
      access as never,
      auditService as never,
      events as never,
    );
  });

  it('rejects successful completion while any objective or milestone is unfinished', async () => {
    access.load.mockResolvedValue(
      workspace({
        objectives: [{ status: ObjectiveStatus.IN_PROGRESS }],
      }),
    );

    await expect(
      service.close('owner-1', 'student', audit, 'workspace-1', request),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_COMPLETION_INCOMPLETE,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires an explicitly scoped platform role for policy action', async () => {
    await expect(
      service.close(
        'owner-1',
        'student',
        audit,
        'workspace-1',
        {
          ...request,
          reason: ProjectClosureReason.POLICY_ACTION,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(access.load).not.toHaveBeenCalled();
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects stale closure versions with the stable actionable code', async () => {
    access.load.mockResolvedValue(workspace({ version: 4 }));

    await expect(
      service.close('owner-1', 'student', audit, 'workspace-1', request),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
    });
    expect(workspaces.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns a completed replay without another audit or event', async () => {
    const stored = workspace({
      status: WorkspaceStatus.COMPLETED,
      version: 4,
      closure: {
        reason: request.reason,
        outcome: 'completed',
        closedAt: new Date('2026-01-01T00:00:00.000Z'),
        closedBy: 'owner-1',
        idempotencyKey: request.idempotencyKey,
        requestHash: requestHash('owner-1', request),
        consents: [],
      },
    });
    access.load.mockResolvedValue(stored);

    const result = await service.close(
      'owner-1',
      'student',
      audit,
      'workspace-1',
      request,
    );

    expect(result.status).toBe(WorkspaceStatus.COMPLETED);
    expect(result.closure).toMatchObject({
      reason: ProjectClosureReason.SUCCESSFUL_COMPLETION,
      outcome: 'completed',
    });
    expect(JSON.stringify(result)).not.toContain(request.idempotencyKey);
    expect(JSON.stringify(result)).not.toContain('requestHash');
    expect(auditService.record).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('omits email, IP, and user agent from closure audit context', async () => {
    const updated = workspace({
      status: WorkspaceStatus.COMPLETED,
      version: 4,
      closure: {
        reason: request.reason,
        outcome: 'completed',
        closedAt: new Date('2026-01-01T00:00:00.000Z'),
        closedBy: 'owner-1',
        idempotencyKey: request.idempotencyKey,
        requestHash: requestHash('owner-1', request),
        consents: [],
      },
    });
    workspaces.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updated),
    });

    await service.close(
      'owner-1',
      'student',
      {
        ...audit,
        actorEmail: 'private@example.test',
        ip: '192.0.2.1',
        userAgent: 'private user agent',
      },
      'workspace-1',
      request,
    );

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          actorEmail: null,
          ip: null,
          userAgent: null,
        }),
      }),
    );
    expect(JSON.stringify(auditService.record.mock.calls)).not.toContain(
      'private@example.test',
    );
  });

  it('returns a stable error for malformed direct service input', async () => {
    await expect(
      service.close(
        'owner-1',
        'student',
        audit,
        'workspace-1',
        { ...request, reason: 'inactivity' } as CloseProjectDto,
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.VAL_INVALID_INPUT,
    });
  });
});
