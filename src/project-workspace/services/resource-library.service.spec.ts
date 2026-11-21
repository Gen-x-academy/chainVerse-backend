import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { AuditContext } from '../../common/audit';
import {
  ResourceAccessPolicy,
  ResourceKind,
  ResourceStatus,
} from '../schemas/project-resource.schema';
import { ResourceLibraryService } from './resource-library.service';

const auditContext: AuditContext = {
  actorId: 'u1',
  actorEmail: 'u1@example.com',
  actorRole: 'student',
  requestId: 'req-1',
  ip: null,
  userAgent: null,
};

const checksum = 'a'.repeat(64);
const workspace = {
  _id: 'ws-1',
  tenantId: 'tenant-1',
  members: [
    { userId: 'u1', role: 'owner' },
    { userId: 'u2', role: 'viewer' },
    { userId: 'u3', role: 'viewer' },
  ],
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

const resource = (overrides: Record<string, unknown> = {}) => ({
  _id: 'res-1',
  tenantId: 'tenant-1',
  projectId: 'ws-1',
  kind: ResourceKind.FILE,
  name: 'Dataset',
  uri: 'datasets/one.csv',
  checksumSha256: checksum,
  accessPolicy: ResourceAccessPolicy.TEAM,
  status: ResourceStatus.PENDING,
  submittedBy: 'u1',
  version: 1,
  previousVersions: [],
  ...overrides,
});

describe('ResourceLibraryService', () => {
  let resources: Record<string, jest.Mock>;
  let access: { load: jest.Mock; loadForMutation: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ResourceLibraryService;

  beforeEach(() => {
    resources = {
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
    service = new ResourceLibraryService(
      resources as never,
      access as never,
      audit as never,
      { emit: jest.fn() } as never,
    );
  });

  it('submits resources as pending with integrity metadata', async () => {
    resources.create.mockImplementation((payload: Record<string, unknown>) => ({
      _id: 'res-1',
      ...payload,
    }));

    const created = await service.submit('u1', auditContext, 'ws-1', {
      kind: ResourceKind.DATASET,
      name: 'Dataset',
      uri: 'datasets/one.csv',
      checksumSha256: checksum,
      license: 'CC-BY-4.0',
      citations: ['Doe, 2024'],
    });

    expect(created.status).toBe(ResourceStatus.PENDING);
    expect(created.accessPolicy).toBe(ResourceAccessPolicy.PRIVATE);
    expect(
      (callsOf(resources.create)[0][0] as { checksumSha256: string })
        .checksumSha256,
    ).toBe(checksum);
    expect(created).not.toHaveProperty('idempotencyKey');
  });

  it('rejects non-https links and unsafe schemes', async () => {
    await expect(
      service.submit('u1', auditContext, 'ws-1', {
        kind: ResourceKind.LINK,
        name: 'Bad',
        uri: 'http://example.com',
        checksumSha256: checksum,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_INVALID_FORMAT });
    expect(resources.create).not.toHaveBeenCalled();
  });

  it('hides unapproved and private resources from other members', async () => {
    resources.find.mockReturnValue(
      query([
        resource({ status: ResourceStatus.PENDING, submittedBy: 'u2' }),
        resource({
          status: ResourceStatus.APPROVED,
          accessPolicy: ResourceAccessPolicy.PRIVATE,
          submittedBy: 'u2',
        }),
        resource({ status: ResourceStatus.APPROVED }),
      ]),
    );

    const visible = await service.list('u3', 'ws-1');
    expect(visible).toHaveLength(1);
    expect(visible[0].status).toBe(ResourceStatus.APPROVED);
  });

  it('does not approve a rejected resource via the approve endpoint', async () => {
    resources.findOne.mockReturnValue(
      query(resource({ status: ResourceStatus.REJECTED })),
    );

    await expect(
      service.approve('u1', auditContext, 'ws-1', 'res-1', {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
    });
    expect(resources.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('approves pending resources with a version lock and audit metadata', async () => {
    resources.findOne.mockReturnValue(query(resource()));
    resources.findOneAndUpdate.mockReturnValue(
      query(resource({ status: ResourceStatus.APPROVED, version: 2 })),
    );

    const approved = await service.approve(
      'u1',
      auditContext,
      'ws-1',
      'res-1',
      {
        expectedVersion: 1,
      },
    );

    expect(approved.status).toBe(ResourceStatus.APPROVED);
    const filter = callsOf(resources.findOneAndUpdate)[0][0] as {
      version: number;
      status: string;
    };
    expect(filter).toMatchObject({
      version: 1,
      status: ResourceStatus.PENDING,
    });
    const entry = callsOf(audit.record)[0][0] as { action: string };
    expect(entry.action).toBe('project_resource.approved');
  });

  it('wraps rule failures in a DomainException with a stable code', async () => {
    resources.findOne.mockReturnValue(query(resource()));
    try {
      await service.reject('u1', auditContext, 'ws-1', 'res-1', {
        expectedVersion: 1,
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as DomainException).errorCode).toBe(
        ErrorCode.VAL_MISSING_FIELD,
      );
    }
  });
});
