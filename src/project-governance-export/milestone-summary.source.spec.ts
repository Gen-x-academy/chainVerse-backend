import { MilestonesAuditService } from '../project-milestones/project-milestones-audit.service';
import { ProjectMilestonesRepository } from '../project-milestones/project-milestones.repository';
import { ProjectMilestonesService } from '../project-milestones/project-milestones.service';
import { MilestoneProjectRole } from '../project-milestones/project-milestones.types';
import { MilestoneSummarySource } from './milestone-summary.source';

describe('MilestoneSummarySource', () => {
  const tenantId = 'tenant-a';
  const admin = { actorId: 'admin-1', tenantId, roles: ['admin'] };
  let milestones: ProjectMilestonesService;
  let source: MilestoneSummarySource;

  beforeEach(async () => {
    milestones = new ProjectMilestonesService(
      new ProjectMilestonesRepository(),
      new MilestonesAuditService(),
    );
    milestones.registerProject(admin, tenantId, {
      id: 'p1',
      tenantId,
      members: { 'owner-1': MilestoneProjectRole.OWNER },
    });
    await milestones.createMilestone(admin, tenantId, 'p1', {
      idempotencyKey: 'ms-key-00001',
      title: 'Private title one',
      description: 'private description',
      dueDate: '2027-05-01',
    });
    await milestones.createMilestone(admin, tenantId, 'p1', {
      idempotencyKey: 'ms-key-00002',
      title: 'Private title two',
      dueDate: '2027-04-01',
    });
    source = new MilestoneSummarySource(milestones);
  });

  it('reduces milestones to counts and the next due date, without private fields', async () => {
    const summary = await source.summarize({
      tenantId,
      projectId: 'p1',
      actor: admin,
    });
    expect(summary).toEqual({
      total: 2,
      byStatus: { draft: 2 },
      nextDueDate: new Date('2027-04-01').toISOString(),
    });
    expect(JSON.stringify(summary)).not.toContain('Private');
  });

  it('propagates the milestones module authorization', async () => {
    await expect(
      source.summarize({
        tenantId,
        projectId: 'p1',
        actor: { actorId: 'stranger', tenantId, roles: ['student'] },
      }),
    ).rejects.toMatchObject({
      response: { errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
    });
  });
});
