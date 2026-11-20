import { Test } from '@nestjs/testing';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { PlanningAuditService } from './project-planning-audit.service';
import { ProjectPlanningRepository } from './project-planning.repository';
import { ProjectPlanningService } from './project-planning.service';
import {
  AddMitigationDto,
  AddProjectMemberDto,
  CreateObjectiveDto,
  CreatePhaseDto,
  CreateProjectDto,
  CreateRiskDto,
  DecideExtensionDto,
  RecordCheckInDto,
  RequestExtensionDto,
} from './dto/project-planning.dto';
import {
  ExtensionStatus,
  PlanningActor,
  PlanningRole,
  RiskLikelihood,
  RiskSeverity,
} from './project-planning.types';

const tenantA = 'tenant-a';
const tenantB = 'tenant-b';
const deadline = '2026-12-31T00:00:00.000Z';

function actor(
  id: string,
  tenantId = tenantA,
  roles: string[] = ['admin'],
): PlanningActor {
  return { actorId: id, tenantId, roles };
}

function key(name: string): string {
  return `key-${name}-0001`;
}

function projectDto(name: string): CreateProjectDto {
  return { idempotencyKey: key(name), name, deadline };
}

describe('ProjectPlanningService', () => {
  let service: ProjectPlanningService;
  let repository: ProjectPlanningRepository;
  let audit: PlanningAuditService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectPlanningService,
        ProjectPlanningRepository,
        PlanningAuditService,
      ],
    }).compile();
    service = moduleRef.get(ProjectPlanningService);
    repository = moduleRef.get(ProjectPlanningRepository);
    audit = moduleRef.get(PlanningAuditService);
  });

  async function createProject(name = 'Apollo'): Promise<string> {
    const project = await service.createProject(
      actor('owner'),
      tenantA,
      projectDto(name),
    );
    return project.id;
  }

  it('tracks objective progress check-ins with bounded percentages', async () => {
    const projectId = await createProject();
    const objective = await service.createObjective(
      actor('owner'),
      tenantA,
      projectId,
      { idempotencyKey: key('objective'), title: 'Ship MVP' },
    );

    const first = await service.recordCheckIn(
      actor('owner'),
      tenantA,
      objective.id,
      {
        idempotencyKey: key('checkin-1'),
        percentage: 40,
        note: 'private status note',
      },
    );
    const second = await service.recordCheckIn(
      actor('owner'),
      tenantA,
      objective.id,
      { idempotencyKey: key('checkin-2'), percentage: 75 },
    );

    expect(first.percentage).toBe(40);
    expect(second.percentage).toBe(75);
    expect(JSON.stringify(first)).not.toContain('private status note');
    const list = await service.listCheckIns(
      actor('owner'),
      tenantA,
      objective.id,
    );
    expect(list).toHaveLength(2);
    await expect(
      service.recordCheckIn(actor('owner'), tenantA, objective.id, {
        idempotencyKey: key('checkin-invalid'),
        percentage: 120,
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it('rejects regressions without an explicit reason and records them with one', async () => {
    const projectId = await createProject();
    const objective = await service.createObjective(
      actor('owner'),
      tenantA,
      projectId,
      { idempotencyKey: key('regression-objective'), title: 'Quality gate' },
    );
    await service.recordCheckIn(actor('owner'), tenantA, objective.id, {
      idempotencyKey: key('regression-80'),
      percentage: 80,
    });

    await expect(
      service.recordCheckIn(actor('owner'), tenantA, objective.id, {
        idempotencyKey: key('regression-60'),
        percentage: 60,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    const regression = await service.recordCheckIn(
      actor('owner'),
      tenantA,
      objective.id,
      {
        idempotencyKey: key('regression-60-reason'),
        percentage: 60,
        regressionReason: 'private regression details',
        note: 'private note',
      },
    );
    expect(regression.regression).toBe(true);
    expect(regression.hasRegressionReason).toBe(true);
    expect(JSON.stringify(regression)).not.toContain(
      'private regression details',
    );
  });

  it('manages risks and owned mitigations', async () => {
    const projectId = await createProject();
    const risk = await service.createRisk(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('risk'),
      title: 'Supplier delay',
      severity: RiskSeverity.HIGH,
      likelihood: RiskLikelihood.MEDIUM,
    });
    expect(risk.severity).toBe(RiskSeverity.HIGH);
    expect(risk.hasMitigation).toBe(false);

    await expect(
      service.createRisk(actor('owner'), tenantA, projectId, {
        idempotencyKey: key('risk-invalid'),
        title: 'Unassessed',
        severity: undefined as unknown as RiskSeverity,
        likelihood: RiskLikelihood.HIGH,
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    await expect(
      service.addMitigation(actor('owner'), tenantA, risk.id, {
        idempotencyKey: key('mitigation-invalid'),
        plan: 'private plan',
      } as AddMitigationDto),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    const mitigated = await service.addMitigation(
      actor('owner'),
      tenantA,
      risk.id,
      {
        idempotencyKey: key('mitigation'),
        ownerId: 'owner',
        plan: 'private mitigation plan',
      },
    );
    expect(mitigated.hasMitigation).toBe(true);
    expect(mitigated.mitigationOwnerId).toBe('owner');
    expect(JSON.stringify(mitigated)).not.toContain('private mitigation plan');

    const risks = await service.listRisks(actor('owner'), tenantA, projectId);
    expect(risks).toHaveLength(1);
  });

  it('builds a date-ordered roadmap', async () => {
    const projectId = await createProject();
    const first = await service.addPhase(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('phase-1'),
      name: 'Discovery',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-02-01T00:00:00.000Z',
    });
    expect(first.name).toBe('Discovery');

    await expect(
      service.addPhase(actor('owner'), tenantA, projectId, {
        idempotencyKey: key('phase-overlap'),
        name: 'Overlap',
        startDate: '2026-01-15T00:00:00.000Z',
        endDate: '2026-03-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    await expect(
      service.addPhase(actor('owner'), tenantA, projectId, {
        idempotencyKey: key('phase-inverted'),
        name: 'Inverted',
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-03-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    await service.addPhase(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('phase-2'),
      name: 'Delivery',
      startDate: '2026-02-01T00:00:00.000Z',
      endDate: '2026-03-01T00:00:00.000Z',
    });
    const roadmap = await service.listRoadmap(
      actor('owner'),
      tenantA,
      projectId,
    );
    expect(roadmap.map((phase) => phase.name)).toEqual([
      'Discovery',
      'Delivery',
    ]);
  });

  it('handles extension requests with bounded days and no self-approval', async () => {
    const projectId = await createProject();
    await service.addProjectMember(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('approver-member'),
      userId: 'approver',
      role: PlanningRole.APPROVER,
    });
    await service.addProjectMember(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('requester-member'),
      userId: 'requester',
      role: PlanningRole.PLANNER,
    });

    await expect(
      service.requestExtension(actor('requester'), tenantA, projectId, {
        idempotencyKey: key('extension-no-reason'),
        requestedDays: 5,
      } as RequestExtensionDto),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    await expect(
      service.requestExtension(actor('requester'), tenantA, projectId, {
        idempotencyKey: key('extension-too-long'),
        requestedDays: 91,
        reason: 'private reason',
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);

    const request = await service.requestExtension(
      actor('requester'),
      tenantA,
      projectId,
      {
        idempotencyKey: key('extension'),
        requestedDays: 7,
        reason: 'private supplier justification',
      },
    );
    expect(request.status).toBe(ExtensionStatus.PENDING);
    expect(JSON.stringify(request)).not.toContain(
      'private supplier justification',
    );

    await expect(
      service.decideExtension(actor('requester'), tenantA, request.id, {
        idempotencyKey: key('self-approve'),
        decision: ExtensionStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    const approved = await service.decideExtension(
      actor('approver'),
      tenantA,
      request.id,
      {
        idempotencyKey: key('approve'),
        decision: ExtensionStatus.APPROVED,
        note: 'private approval note',
      },
    );
    expect(approved.status).toBe(ExtensionStatus.APPROVED);
    expect(approved.effectiveDeadline).toBe('2027-01-07T00:00:00.000Z');
    expect(JSON.stringify(approved)).not.toContain('private approval note');

    await expect(
      service.decideExtension(actor('approver'), tenantA, request.id, {
        idempotencyKey: key('approve-again'),
        decision: ExtensionStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ResourceConflictException);
  });

  it('enforces tenant isolation and deny-by-default access', async () => {
    const projectId = await createProject();
    const objective = await service.createObjective(
      actor('owner'),
      tenantA,
      projectId,
      {
        idempotencyKey: key('isolation-objective'),
        title: 'Private objective',
      },
    );

    expect(
      await service.listProjects(actor('owner', tenantB), tenantB),
    ).toEqual([]);
    await expect(
      service.listObjectives(actor('owner', tenantB), tenantB, projectId),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(
      service.listCheckIns(actor('owner', tenantB), tenantB, objective.id),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(
      service.createProject(
        actor('owner', tenantB),
        tenantA,
        projectDto('cross-tenant'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    await expect(
      service.createProject(
        actor('student', tenantA, ['student']),
        tenantA,
        projectDto('student'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.createProject(undefined, tenantA, projectDto('anonymous')),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    await service.addProjectMember(actor('owner'), tenantA, projectId, {
      idempotencyKey: key('viewer-member'),
      userId: 'viewer',
      role: PlanningRole.VIEWER,
    });
    await expect(
      service.recordCheckIn(
        actor('viewer', tenantA, ['student']),
        tenantA,
        objective.id,
        {
          idempotencyKey: key('viewer-checkin'),
          percentage: 10,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.listCheckIns(
        actor('stranger', tenantA, ['student']),
        tenantA,
        objective.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('replays retries idempotently, detects payload reuse and serializes concurrency', async () => {
    const first = await service.createProject(
      actor('owner'),
      tenantA,
      projectDto('idempotent'),
    );
    const replay = await service.createProject(
      actor('owner'),
      tenantA,
      projectDto('idempotent'),
    );
    expect(replay.id).toBe(first.id);
    expect(repository.projectsByTenant(tenantA)).toHaveLength(1);

    await expect(
      service.createProject(actor('owner'), tenantA, {
        ...projectDto('idempotent'),
        name: 'Different name',
      }),
    ).rejects.toBeInstanceOf(ResourceConflictException);

    const concurrentKey = key('concurrent');
    const results = await Promise.all([
      service.createProject(actor('owner'), tenantA, {
        idempotencyKey: concurrentKey,
        name: 'Concurrent A',
        deadline,
      }),
      service.createProject(actor('owner'), tenantA, {
        idempotencyKey: concurrentKey,
        name: 'Concurrent A',
        deadline,
      }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(repository.projectsByTenant(tenantA)).toHaveLength(2);
  });

  it('audits metadata only and never stores private payloads', async () => {
    const projectId = await createProject();
    const objective = await service.createObjective(
      actor('owner'),
      tenantA,
      projectId,
      { idempotencyKey: key('audit-objective'), title: 'Audit target' },
    );
    await service.recordCheckIn(actor('owner'), tenantA, objective.id, {
      idempotencyKey: key('audit-checkin'),
      percentage: 30,
      note: 'secret note value',
      regressionReason: 'secret regression value',
    });
    const request = await service.requestExtension(
      actor('owner'),
      tenantA,
      projectId,
      {
        idempotencyKey: key('audit-extension'),
        requestedDays: 3,
        reason: 'secret reason value',
      },
    );
    const entries = audit.snapshot();
    const serialized = JSON.stringify(entries);

    expect(entries.length).toBeGreaterThan(0);
    for (const secret of [
      'secret note value',
      'secret regression value',
      'secret reason value',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(entries.every((entry) => entry.tenantId === tenantA)).toBe(true);
    expect(
      entries.every((entry) => typeof entry.fingerprint === 'string'),
    ).toBe(true);
    expect(entries.some((entry) => entry.resourceId === request.id)).toBe(true);
    expect(Object.keys(entries[0])).toEqual(
      expect.arrayContaining([
        'action',
        'tenantId',
        'actorId',
        'actorRoles',
        'resourceType',
        'resourceId',
        'outcome',
        'fingerprint',
        'requestHash',
        'timestamp',
      ]),
    );
  });
});
