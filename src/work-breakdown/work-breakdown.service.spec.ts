/**
 * CAPSTONE-058 — WorkBreakdownService unit tests
 *
 * Coverage: success paths, invalid input, auth/authorization, concurrency,
 * idempotency, state transitions, dependency cycles, and dependency failures.
 */
import { Test } from '@nestjs/testing';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { WorkBreakdownAuditService } from './work-breakdown-audit.service';
import { WorkBreakdownRepository } from './work-breakdown.repository';
import { WorkBreakdownService } from './work-breakdown.service';
import {
  AddDependencyDto,
  AdvancePackageStatusDto,
  AssignRoleDto,
  CreateTaskDto,
  CreateWbsDto,
  CreateWorkPackageDto,
  SetEstimateDto,
  UpdateTaskDto,
  UpdateWbsDto,
  UpdateWorkPackageDto,
} from './dto/work-breakdown.dto';
import {
  PackageStatus,
  WbsActor,
  WbsRole,
  WeightUnit,
} from './work-breakdown.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function actor(
  id: string,
  tenantId = TENANT_A,
  roles: string[] = ['admin'],
): WbsActor {
  return { actorId: id, tenantId, roles };
}

function key(name: string): string {
  return `idem-${name}-0001`;
}

function wbsDto(projectId = 'project-1'): CreateWbsDto {
  return {
    idempotencyKey: key('wbs'),
    projectId,
    title: 'Sprint Breakdown',
    description: 'All sprints',
  };
}

function pkgDto(title = 'Package A'): CreateWorkPackageDto {
  return {
    idempotencyKey: key(`pkg-${title}`),
    title,
    acceptanceCriteria: ['Passes CI'],
    progressWeight: 10,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('WorkBreakdownService', () => {
  let service: WorkBreakdownService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkBreakdownService,
        WorkBreakdownRepository,
        WorkBreakdownAuditService,
      ],
    }).compile();
    service = moduleRef.get(WorkBreakdownService);
  });

  // ── WBS CRUD ──────────────────────────────────────────────────────────────

  describe('createWbs', () => {
    it('creates a WBS and returns a sanitised view', async () => {
      const result = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      expect(result.id).toBeTruthy();
      expect(result.title).toBe('Sprint Breakdown');
      expect(result.orderedPackages).toEqual([]);
      expect(result.createdBy).toBe('a1');
    });

    it('rejects a student role', async () => {
      await expect(
        service.createWbs(actor('s1', TENANT_A, ['student']), TENANT_A, wbsDto()),
      ).rejects.toThrow(ForbiddenDomainException);
    });

    it('rejects cross-tenant access', async () => {
      await expect(
        service.createWbs(actor('a1', TENANT_B), TENANT_A, wbsDto()),
      ).rejects.toThrow(ForbiddenDomainException);
    });

    it('returns cached result for the same idempotency key', async () => {
      const first = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const second = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      expect(second.id).toBe(first.id);
    });

    it('rejects key reuse with a different payload', async () => {
      await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const altered: CreateWbsDto = { ...wbsDto(), title: 'Different Title' };
      await expect(
        service.createWbs(actor('a1'), TENANT_A, altered),
      ).rejects.toThrow(ResourceConflictException);
    });
  });

  describe('listWbs', () => {
    it('returns WBS list for a project', async () => {
      await service.createWbs(actor('a1'), TENANT_A, wbsDto('proj-x'));
      const list = await service.listWbs(actor('a1'), TENANT_A, 'proj-x');
      expect(list).toHaveLength(1);
    });

    it('returns empty when project has no WBS', async () => {
      const list = await service.listWbs(actor('a1'), TENANT_A, 'no-proj');
      expect(list).toEqual([]);
    });
  });

  describe('getWbs', () => {
    it('returns the WBS view', async () => {
      const created = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const fetched = await service.getWbs(actor('a1'), TENANT_A, created.id);
      expect(fetched.id).toBe(created.id);
    });

    it('throws NOT_FOUND for unknown WBS', async () => {
      await expect(
        service.getWbs(actor('a1'), TENANT_A, 'nonexistent'),
      ).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('updateWbs', () => {
    it('updates title and description', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const dto: UpdateWbsDto = { title: 'New Title' };
      const updated = await service.updateWbs(actor('a1'), TENANT_A, wbs.id, dto);
      expect(updated.title).toBe('New Title');
    });

    it('rejects orderedPackages that do not match existing packages', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const dto: UpdateWbsDto = { orderedPackages: ['nonexistent-id'] };
      await expect(
        service.updateWbs(actor('a1'), TENANT_A, wbs.id, dto),
      ).rejects.toThrow(ValidationDomainException);
    });

    it('accepts orderedPackages that exactly matches existing packages', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg1 = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('P1'),
        idempotencyKey: key('p1'),
      });
      const pkg2 = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('P2'),
        idempotencyKey: key('p2'),
      });
      const dto: UpdateWbsDto = { orderedPackages: [pkg2.id, pkg1.id] };
      const updated = await service.updateWbs(actor('a1'), TENANT_A, wbs.id, dto);
      expect(updated.orderedPackages).toEqual([pkg2.id, pkg1.id]);
    });
  });

  // ── Work Package CRUD ─────────────────────────────────────────────────────

  describe('createPackage', () => {
    it('creates a package with defaults', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      expect(pkg.status).toBe(PackageStatus.PENDING);
      expect(pkg.order).toBe(1);
      expect(pkg.acceptanceCriteria).toEqual(['Passes CI']);
      expect(pkg.progressWeight).toBe(10);
    });

    it('appends to orderedPackages on the parent WBS', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const refreshed = await service.getWbs(actor('a1'), TENANT_A, wbs.id);
      expect(refreshed.orderedPackages).toContain(pkg.id);
    });

    it('rejects declared dependency from another WBS', async () => {
      const wbsA = await service.createWbs(actor('a1'), TENANT_A, {
        ...wbsDto(),
        idempotencyKey: key('wbs-a'),
      });
      const wbsB = await service.createWbs(actor('a1'), TENANT_A, {
        ...wbsDto(),
        projectId: 'proj-b',
        idempotencyKey: key('wbs-b'),
      });
      const pkgB = await service.createPackage(actor('a1'), TENANT_A, wbsB.id, {
        ...pkgDto(),
        idempotencyKey: key('pkg-b'),
      });
      await expect(
        service.createPackage(actor('a1'), TENANT_A, wbsA.id, {
          ...pkgDto('WithBadDep'),
          idempotencyKey: key('pkg-bad'),
          dependsOn: [pkgB.id],
        }),
      ).rejects.toThrow(ValidationDomainException);
    });
  });

  describe('updatePackage', () => {
    it('updates assignees and acceptanceCriteria', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const dto: UpdateWorkPackageDto = {
        assignees: ['user-x'],
        acceptanceCriteria: ['Passes CI', 'Reviewed'],
      };
      const updated = await service.updatePackage(actor('a1'), TENANT_A, pkg.id, dto);
      expect(updated.assignees).toEqual(['user-x']);
      expect(updated.acceptanceCriteria).toHaveLength(2);
    });

    it('refuses update on DONE package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('s1'),
        status: PackageStatus.IN_PROGRESS,
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('s2'),
        status: PackageStatus.DONE,
      });
      await expect(
        service.updatePackage(actor('a1'), TENANT_A, pkg.id, { title: 'New' }),
      ).rejects.toThrow(BusinessRuleException);
    });
  });

  // ── Status transitions ────────────────────────────────────────────────────

  describe('advanceStatus', () => {
    it('advances PENDING → IN_PROGRESS', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const updated = await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('t1'),
        status: PackageStatus.IN_PROGRESS,
      });
      expect(updated.status).toBe(PackageStatus.IN_PROGRESS);
    });

    it('rejects an invalid transition (PENDING → DONE)', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await expect(
        service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
          idempotencyKey: key('t-bad'),
          status: PackageStatus.DONE,
        }),
      ).rejects.toThrow(BusinessRuleException);
    });

    it('requires blockerNote when moving to BLOCKED', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('s-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await expect(
        service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
          idempotencyKey: key('s-block'),
          status: PackageStatus.BLOCKED,
        }),
      ).rejects.toThrow(ValidationDomainException);
    });

    it('accepts BLOCKED with a blockerNote', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('s-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      const result = await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('s-blk'),
        status: PackageStatus.BLOCKED,
        blockerNote: 'Waiting for API key',
      });
      expect(result.status).toBe(PackageStatus.BLOCKED);
    });

    it('blocks DONE when a dependency is not DONE', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const dep = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('Dep'),
        idempotencyKey: key('dep'),
      });
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('Main'),
        idempotencyKey: key('main'),
        dependsOn: [dep.id],
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('p-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await expect(
        service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
          idempotencyKey: key('p-done'),
          status: PackageStatus.DONE,
        }),
      ).rejects.toThrow(BusinessRuleException);
    });

    it('allows DONE when all dependencies are DONE', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const dep = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('Dep'),
        idempotencyKey: key('dep2'),
      });
      // Complete the dependency first.
      await service.advanceStatus(actor('a1'), TENANT_A, dep.id, {
        idempotencyKey: key('d-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await service.advanceStatus(actor('a1'), TENANT_A, dep.id, {
        idempotencyKey: key('d-done'),
        status: PackageStatus.DONE,
      });

      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('Main2'),
        idempotencyKey: key('main2'),
        dependsOn: [dep.id],
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('m-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      const done = await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('m-done'),
        status: PackageStatus.DONE,
      });
      expect(done.status).toBe(PackageStatus.DONE);
    });
  });

  // ── Estimate ──────────────────────────────────────────────────────────────

  describe('setEstimate', () => {
    it('sets an estimate on a package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const dto: SetEstimateDto = {
        idempotencyKey: key('est'),
        value: 5,
        unit: WeightUnit.STORY_POINTS,
      };
      const result = await service.setEstimate(actor('a1'), TENANT_A, pkg.id, dto);
      expect(result.estimate?.value).toBe(5);
      expect(result.estimate?.unit).toBe(WeightUnit.STORY_POINTS);
    });

    it('refuses estimate on DONE package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('e-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('e-dn'),
        status: PackageStatus.DONE,
      });
      await expect(
        service.setEstimate(actor('a1'), TENANT_A, pkg.id, {
          idempotencyKey: key('est-bad'),
          value: 5,
          unit: WeightUnit.HOURS,
        }),
      ).rejects.toThrow(BusinessRuleException);
    });
  });

  // ── Role assignment ───────────────────────────────────────────────────────

  describe('assignRole', () => {
    it('assigns a role to a user on a package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const dto: AssignRoleDto = {
        idempotencyKey: key('role'),
        userId: 'user-b',
        role: WbsRole.EXECUTOR,
      };
      const result = await service.assignRole(actor('a1'), TENANT_A, pkg.id, dto);
      // The view does not expose the roles map — test via re-query on a new pkg
      expect(result.id).toBe(pkg.id);
    });

    it('denies non-owner from assigning roles', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      // Assign a1 as executor (non-owner)
      await service.assignRole(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('role-exec'),
        userId: 'user-c',
        role: WbsRole.EXECUTOR,
      });
      // user-c (executor) tries to assign roles — denied
      await expect(
        service.assignRole(actor('user-c', TENANT_A, ['student']), TENANT_A, pkg.id, {
          idempotencyKey: key('role-bad'),
          userId: 'user-d',
          role: WbsRole.VIEWER,
        }),
      ).rejects.toThrow(ForbiddenDomainException);
    });
  });

  // ── Dependencies ─────────────────────────────────────────────────────────

  describe('addDependency', () => {
    it('adds a dependency edge', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg1 = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('P1'),
        idempotencyKey: key('d-p1'),
      });
      const pkg2 = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('P2'),
        idempotencyKey: key('d-p2'),
      });
      const dto: AddDependencyDto = {
        idempotencyKey: key('dep-add'),
        fromPackageId: pkg1.id,
        toPackageId: pkg2.id,
      };
      const dep = await service.addDependency(actor('a1'), TENANT_A, wbs.id, dto);
      expect(dep.fromPackageId).toBe(pkg1.id);
      expect(dep.toPackageId).toBe(pkg2.id);
    });

    it('rejects a self-loop', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await expect(
        service.addDependency(actor('a1'), TENANT_A, wbs.id, {
          idempotencyKey: key('dep-self'),
          fromPackageId: pkg.id,
          toPackageId: pkg.id,
        }),
      ).rejects.toThrow(ValidationDomainException);
    });

    it('detects a dependency cycle (A→B→A)', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkgA = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('A'),
        idempotencyKey: key('cyc-a'),
      });
      const pkgB = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('B'),
        idempotencyKey: key('cyc-b'),
        dependsOn: [pkgA.id],
      });
      // Adding B→A would create A→B→A cycle (since B already depends on A, adding A depends on B creates cycle)
      await expect(
        service.addDependency(actor('a1'), TENANT_A, wbs.id, {
          idempotencyKey: key('cyc-edge'),
          fromPackageId: pkgB.id,
          toPackageId: pkgA.id,
        }),
      ).rejects.toThrow(BusinessRuleException);
    });

    it('rejects a duplicate dependency edge', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkgA = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('DA'),
        idempotencyKey: key('dup-a'),
      });
      const pkgB = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('DB'),
        idempotencyKey: key('dup-b'),
      });
      await service.addDependency(actor('a1'), TENANT_A, wbs.id, {
        idempotencyKey: key('dup-dep1'),
        fromPackageId: pkgA.id,
        toPackageId: pkgB.id,
      });
      await expect(
        service.addDependency(actor('a1'), TENANT_A, wbs.id, {
          idempotencyKey: key('dup-dep2'),
          fromPackageId: pkgA.id,
          toPackageId: pkgB.id,
        }),
      ).rejects.toThrow(ResourceConflictException);
    });
  });

  describe('removeDependency', () => {
    it('removes an existing dependency', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkgA = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('RA'),
        idempotencyKey: key('rem-a'),
      });
      const pkgB = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('RB'),
        idempotencyKey: key('rem-b'),
      });
      const dep = await service.addDependency(actor('a1'), TENANT_A, wbs.id, {
        idempotencyKey: key('rem-dep'),
        fromPackageId: pkgA.id,
        toPackageId: pkgB.id,
      });
      const result = await service.removeDependency(actor('a1'), TENANT_A, dep.id);
      expect(result.removed).toBe(true);
    });

    it('throws NOT_FOUND when removing nonexistent dependency', async () => {
      await expect(
        service.removeDependency(actor('a1'), TENANT_A, 'ghost'),
      ).rejects.toThrow(ResourceNotFoundException);
    });
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates a task inside a package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const dto: CreateTaskDto = {
        idempotencyKey: key('task1'),
        title: 'Write unit tests',
        assigneeId: 'user-x',
        dueAt: '2027-01-01T00:00:00.000Z',
      };
      const task = await service.createTask(actor('a1'), TENANT_A, pkg.id, dto);
      expect(task.title).toBe('Write unit tests');
      expect(task.done).toBe(false);
      expect(task.assigneeId).toBe('user-x');
    });

    it('rejects task creation on DONE package', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('t-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('t-dn'),
        status: PackageStatus.DONE,
      });
      await expect(
        service.createTask(actor('a1'), TENANT_A, pkg.id, {
          idempotencyKey: key('task-bad'),
          title: 'Too late',
        }),
      ).rejects.toThrow(BusinessRuleException);
    });

    it('returns idempotent result for duplicate task creation', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const dto: CreateTaskDto = { idempotencyKey: key('task-idem'), title: 'Idempotent Task' };
      const first = await service.createTask(actor('a1'), TENANT_A, pkg.id, dto);
      const second = await service.createTask(actor('a1'), TENANT_A, pkg.id, dto);
      expect(second.id).toBe(first.id);
    });
  });

  describe('updateTask', () => {
    it('marks a task as done', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg = await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const task = await service.createTask(actor('a1'), TENANT_A, pkg.id, {
        idempotencyKey: key('ut-t1'),
        title: 'Build feature',
      });
      const dto: UpdateTaskDto = { done: true };
      const updated = await service.updateTask(actor('a1'), TENANT_A, task.id, dto);
      expect(updated.done).toBe(true);
    });

    it('throws NOT_FOUND for unknown task', async () => {
      await expect(
        service.updateTask(actor('a1'), TENANT_A, 'ghost', { done: true }),
      ).rejects.toThrow(ResourceNotFoundException);
    });
  });

  // ── Progress report ───────────────────────────────────────────────────────

  describe('progressReport', () => {
    it('computes weighted progress for a WBS', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const pkg1 = await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('W1'),
        idempotencyKey: key('w-p1'),
        progressWeight: 30,
      });
      await service.createPackage(actor('a1'), TENANT_A, wbs.id, {
        ...pkgDto('W2'),
        idempotencyKey: key('w-p2'),
        progressWeight: 70,
      });

      // Complete pkg1 only.
      await service.advanceStatus(actor('a1'), TENANT_A, pkg1.id, {
        idempotencyKey: key('w-ip'),
        status: PackageStatus.IN_PROGRESS,
      });
      await service.advanceStatus(actor('a1'), TENANT_A, pkg1.id, {
        idempotencyKey: key('w-done'),
        status: PackageStatus.DONE,
      });

      const report = await service.progressReport(actor('a1'), TENANT_A, wbs.id);
      expect(report.totalWeight).toBe(100);
      expect(report.completedWeight).toBe(30);
      expect(report.progressPercent).toBe(30);
    });

    it('returns 0% when no packages are done', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      await service.createPackage(actor('a1'), TENANT_A, wbs.id, pkgDto());
      const report = await service.progressReport(actor('a1'), TENANT_A, wbs.id);
      expect(report.progressPercent).toBe(0);
    });

    it('returns 0% and 0 weight when WBS has no packages', async () => {
      const wbs = await service.createWbs(actor('a1'), TENANT_A, wbsDto());
      const report = await service.progressReport(actor('a1'), TENANT_A, wbs.id);
      expect(report.totalWeight).toBe(0);
      expect(report.progressPercent).toBe(0);
    });
  });

  // ── Authorization ─────────────────────────────────────────────────────────

  describe('authorization', () => {
    it('denies undefined actor', async () => {
      await expect(
        service.createWbs(undefined, TENANT_A, wbsDto()),
      ).rejects.toThrow(ForbiddenDomainException);
    });

    it('denies actor with empty actorId', async () => {
      await expect(
        service.createWbs(
          { actorId: '', tenantId: TENANT_A, roles: ['admin'] },
          TENANT_A,
          wbsDto(),
        ),
      ).rejects.toThrow(ForbiddenDomainException);
    });

    it('denies actor with empty roles', async () => {
      await expect(
        service.createWbs(
          { actorId: 'a1', tenantId: TENANT_A, roles: [] },
          TENANT_A,
          wbsDto(),
        ),
      ).rejects.toThrow(ForbiddenDomainException);
    });

    it('tutor role may create WBS', async () => {
      const result = await service.createWbs(
        actor('t1', TENANT_A, ['tutor']),
        TENANT_A,
        { ...wbsDto(), idempotencyKey: key('tutor-wbs') },
      );
      expect(result.id).toBeTruthy();
    });
  });

  // ── Concurrency / idempotency ─────────────────────────────────────────────

  describe('concurrent idempotent mutations', () => {
    it('two concurrent requests with the same key return the same result', async () => {
      const dto = wbsDto();
      const [r1, r2] = await Promise.all([
        service.createWbs(actor('a1'), TENANT_A, dto),
        service.createWbs(actor('a1'), TENANT_A, dto),
      ]);
      expect(r1.id).toBe(r2.id);
    });
  });
});
