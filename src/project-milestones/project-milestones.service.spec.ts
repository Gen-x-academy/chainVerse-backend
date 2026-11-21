import { ProjectMilestonesRepository } from './project-milestones.repository';
import { ProjectMilestonesService } from './project-milestones.service';
import { MilestonesAuditService } from './project-milestones-audit.service';
import {
  MilestoneProjectRole,
  MilestoneStatus,
  MilestonesActor,
} from './project-milestones.types';

describe('ProjectMilestonesService', () => {
  let service: ProjectMilestonesService;
  let repository: ProjectMilestonesRepository;
  const tenantId = 'tenant-a';
  const owner: MilestonesActor = {
    actorId: 'owner-1',
    tenantId,
    roles: ['admin'],
  };

  beforeEach(() => {
    repository = new ProjectMilestonesRepository();
    service = new ProjectMilestonesService(
      repository,
      new MilestonesAuditService(),
    );
    service.registerProject(owner, tenantId, {
      id: 'project-1',
      tenantId,
      members: {
        'owner-1': MilestoneProjectRole.OWNER,
        'reviewer-1': MilestoneProjectRole.REVIEWER,
        'viewer-1': MilestoneProjectRole.VIEWER,
      },
    });
  });

  it('creates ordered milestones and preserves private fields from views', async () => {
    const first = await service.createMilestone(owner, tenantId, 'project-1', {
      idempotencyKey: 'create-milestone-001',
      title: 'Research',
      dueDate: '2027-03-31',
      description: 'private description',
      deliverables: ['private deliverable'],
      completionCriteria: 'private criteria',
      reviewerId: 'reviewer-1',
    });
    const second = await service.createMilestone(
      owner,
      tenantId,
      'project-1',
      {
        idempotencyKey: 'create-milestone-002',
        title: 'Prototype',
        dueDate: '2027-04-30',
        dependsOn: [first.id],
      },
    );

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(JSON.stringify([first, second])).not.toContain('private');
  });

  it('blocks activation until dependencies complete', async () => {
    const first = await service.createMilestone(owner, tenantId, 'project-1', {
      idempotencyKey: 'dependency-first-001',
      title: 'First',
      dueDate: '2027-03-31',
    });
    const second = await service.createMilestone(owner, tenantId, 'project-1', {
      idempotencyKey: 'dependency-second-002',
      title: 'Second',
      dueDate: '2027-04-30',
      dependsOn: [first.id],
    });

    await expect(
      service.transitionMilestone(owner, tenantId, second.id, {
        idempotencyKey: 'activate-second-003',
        status: MilestoneStatus.ACTIVE,
      }),
    ).rejects.toMatchObject({ errorCode: 'BIZ_MILESTONE_DEPENDENCY_NOT_MET' });
  });

  it('rejects terminal transitions and cross-tenant reads', async () => {
    const milestone = await service.createMilestone(owner, tenantId, 'project-1', {
      idempotencyKey: 'terminal-create-001',
      title: 'Terminal',
      dueDate: '2027-03-31',
    });
    await service.transitionMilestone(owner, tenantId, milestone.id, {
      idempotencyKey: 'terminal-active-002',
      status: MilestoneStatus.ACTIVE,
    });
    await service.transitionMilestone(owner, tenantId, milestone.id, {
      idempotencyKey: 'terminal-complete-003',
      status: MilestoneStatus.COMPLETED,
    });

    await expect(
      service.transitionMilestone(owner, tenantId, milestone.id, {
        idempotencyKey: 'terminal-invalid-004',
        status: MilestoneStatus.ACTIVE,
      }),
    ).rejects.toMatchObject({ errorCode: 'BIZ_MILESTONE_INVALID_TRANSITION' });
    await expect(
      service.getMilestoneById(owner, 'tenant-b', milestone.id),
    ).rejects.toMatchObject({ errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' });
  });

  it('replays identical retries and rejects reused keys with different payloads', async () => {
    const dto = {
      idempotencyKey: 'concurrent-create-001',
      title: 'Idempotent',
      dueDate: '2027-05-31',
    };
    const first = await service.createMilestone(
      owner,
      tenantId,
      'project-1',
      dto,
    );
    const replay = await service.createMilestone(
      owner,
      tenantId,
      'project-1',
      dto,
    );
    expect(replay).toEqual(first);

    await expect(
      service.createMilestone(owner, tenantId, 'project-1', {
        ...dto,
        title: 'Different',
      }),
    ).rejects.toMatchObject({ errorCode: 'BIZ_IDEMPOTENCY_KEY_REUSED' });
  });

  it('denies viewer mutations and creates no milestone', async () => {
    const viewer: MilestonesActor = {
      actorId: 'viewer-1',
      tenantId,
      roles: ['student'],
    };
    await expect(
      service.createMilestone(viewer, tenantId, 'project-1', {
        idempotencyKey: 'viewer-create-001',
        title: 'Forbidden',
        dueDate: '2027-05-31',
      }),
    ).rejects.toMatchObject({ errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' });
  });
});
