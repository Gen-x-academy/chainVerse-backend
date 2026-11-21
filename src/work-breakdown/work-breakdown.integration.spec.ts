/**
 * CAPSTONE-058 — WorkBreakdownService integration tests
 *
 * These tests run the service directly against the in-memory repository
 * (no DB, no HTTP), exercising multi-step workflows that span multiple service
 * calls. They complement the unit spec by verifying that state accumulated
 * across calls is consistent.
 */
import { Test } from '@nestjs/testing';
import { WorkBreakdownAuditService } from './work-breakdown-audit.service';
import { WorkBreakdownRepository } from './work-breakdown.repository';
import { WorkBreakdownService } from './work-breakdown.service';
import { PackageStatus, WbsActor, WeightUnit } from './work-breakdown.types';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
} from '../common/errors/domain.exception';

const TENANT = 'tenant-integration';

function admin(id = 'adm-1'): WbsActor {
  return { actorId: id, tenantId: TENANT, roles: ['admin'] };
}

function student(id = 'stu-1'): WbsActor {
  return { actorId: id, tenantId: TENANT, roles: ['student'] };
}

let idemSeq = 0;
function idem(label = 'op'): string {
  return `idem-${label}-${++idemSeq}`;
}

describe('WorkBreakdownService — integration', () => {
  let service: WorkBreakdownService;
  let audit: WorkBreakdownAuditService;

  beforeEach(async () => {
    idemSeq = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkBreakdownService,
        WorkBreakdownRepository,
        WorkBreakdownAuditService,
      ],
    }).compile();
    service = moduleRef.get(WorkBreakdownService);
    audit = moduleRef.get(WorkBreakdownAuditService);
  });

  // ── Full lifecycle journey ─────────────────────────────────────────────────

  it('completes a full WBS lifecycle: create → add packages → set estimates → add tasks → complete', async () => {
    // 1. Create WBS
    const wbs = await service.createWbs(admin(), TENANT, {
      idempotencyKey: idem('wbs'),
      projectId: 'proj-lifecycle',
      title: 'Lifecycle WBS',
    });
    expect(wbs.orderedPackages).toHaveLength(0);

    // 2. Add two work packages
    const pkgA = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('pkg-a'),
      title: 'Package A',
      progressWeight: 40,
      acceptanceCriteria: ['Tests pass', 'Review approved'],
    });
    const pkgB = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('pkg-b'),
      title: 'Package B',
      progressWeight: 60,
      dependsOn: [pkgA.id],
    });

    // WBS ordered list reflects both packages.
    const wbsFresh = await service.getWbs(admin(), TENANT, wbs.id);
    expect(wbsFresh.orderedPackages).toEqual([pkgA.id, pkgB.id]);

    // 3. Set estimates
    await service.setEstimate(admin(), TENANT, pkgA.id, {
      idempotencyKey: idem('est-a'),
      value: 8,
      unit: WeightUnit.STORY_POINTS,
    });

    // 4. Add tasks to Package A
    const task1 = await service.createTask(admin(), TENANT, pkgA.id, {
      idempotencyKey: idem('task-a1'),
      title: 'Write unit tests',
    });
    const task2 = await service.createTask(admin(), TENANT, pkgA.id, {
      idempotencyKey: idem('task-a2'),
      title: 'Write integration tests',
    });
    const tasks = await service.listTasks(admin(), TENANT, pkgA.id);
    expect(tasks).toHaveLength(2);

    // 5. Mark task1 done
    await service.updateTask(admin(), TENANT, task1.id, { done: true });

    // 6. Advance Package A through lifecycle → DONE
    await service.advanceStatus(admin(), TENANT, pkgA.id, {
      idempotencyKey: idem('a-ip'),
      status: PackageStatus.IN_PROGRESS,
    });
    await service.advanceStatus(admin(), TENANT, pkgA.id, {
      idempotencyKey: idem('a-done'),
      status: PackageStatus.DONE,
    });

    // 7. Package B can now also be DONE.
    await service.advanceStatus(admin(), TENANT, pkgB.id, {
      idempotencyKey: idem('b-ip'),
      status: PackageStatus.IN_PROGRESS,
    });
    const bDone = await service.advanceStatus(admin(), TENANT, pkgB.id, {
      idempotencyKey: idem('b-done'),
      status: PackageStatus.DONE,
    });
    expect(bDone.status).toBe(PackageStatus.DONE);

    // 8. Progress report shows 100%.
    const report = await service.progressReport(admin(), TENANT, wbs.id);
    expect(report.progressPercent).toBe(100);
    expect(report.completedWeight).toBe(100);
  });

  // ── Dependency graph integrity ─────────────────────────────────────────────

  it('prevents transitivity cycle: A→B, B→C, then C→A', async () => {
    const wbs = await service.createWbs(admin(), TENANT, {
      idempotencyKey: idem('wbs-cyc'),
      projectId: 'proj-cycle',
      title: 'Cycle Test WBS',
    });
    const pkgA = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('c-a'),
      title: 'A',
    });
    const pkgB = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('c-b'),
      title: 'B',
      dependsOn: [pkgA.id],
    });
    const pkgC = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('c-c'),
      title: 'C',
      dependsOn: [pkgB.id],
    });
    // C already transitively depends on A — adding A→C (fromA, toC means C depends on A)
    // is fine; but adding C→A (fromC, toA means A depends on C) would be a cycle.
    await expect(
      service.addDependency(admin(), TENANT, wbs.id, {
        idempotencyKey: idem('cyc-edge'),
        fromPackageId: pkgC.id,
        toPackageId: pkgA.id,
      }),
    ).rejects.toThrow(BusinessRuleException);
  });

  // ── Audit trail ───────────────────────────────────────────────────────────

  it('records audit entries for successful mutations', async () => {
    const wbs = await service.createWbs(admin(), TENANT, {
      idempotencyKey: idem('aud-wbs'),
      projectId: 'proj-audit',
      title: 'Audit WBS',
    });
    await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('aud-pkg'),
      title: 'Audited Package',
    });
    const snap = audit.snapshot();
    expect(snap.length).toBeGreaterThanOrEqual(2);
    const wbsEntry = snap.find((e) => e.action.startsWith('wbs.create'));
    expect(wbsEntry).toBeDefined();
    // Sensitive fields must not appear in audit entries.
    expect(JSON.stringify(wbsEntry)).not.toContain('idempotencyKey');
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it('tenant-A WBS is not visible to tenant-B actor', async () => {
    // Create a WBS in tenant-A
    await service.createWbs(admin('a-adm'), TENANT, {
      idempotencyKey: idem('iso-wbs'),
      projectId: 'proj-iso',
      title: 'Tenant A WBS',
    });

    // Tenant-B actor cannot see it.
    const tenantB = 'tenant-b';
    const actorB: WbsActor = { actorId: 'b-adm', tenantId: tenantB, roles: ['admin'] };
    const listB = await service.listWbs(actorB, tenantB, 'proj-iso');
    expect(listB).toHaveLength(0);
  });

  // ── Idempotency under retries ─────────────────────────────────────────────

  it('concurrent identical status transitions return the same result without duplication', async () => {
    const wbs = await service.createWbs(admin(), TENANT, {
      idempotencyKey: idem('c-wbs'),
      projectId: 'proj-conc',
      title: 'Concurrent WBS',
    });
    const pkg = await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('c-pkg'),
      title: 'Concurrent Package',
    });

    const advKey = idem('c-advance');
    const [r1, r2, r3] = await Promise.all([
      service.advanceStatus(admin(), TENANT, pkg.id, {
        idempotencyKey: advKey,
        status: PackageStatus.IN_PROGRESS,
      }),
      service.advanceStatus(admin(), TENANT, pkg.id, {
        idempotencyKey: advKey,
        status: PackageStatus.IN_PROGRESS,
      }),
      service.advanceStatus(admin(), TENANT, pkg.id, {
        idempotencyKey: advKey,
        status: PackageStatus.IN_PROGRESS,
      }),
    ]);
    expect(r1.status).toBe(PackageStatus.IN_PROGRESS);
    expect(r2.status).toBe(PackageStatus.IN_PROGRESS);
    expect(r3.status).toBe(PackageStatus.IN_PROGRESS);

    // List the packages — still exactly one, not three.
    const packages = await service.listPackages(admin(), TENANT, wbs.id);
    expect(packages).toHaveLength(1);
  });

  // ── Authorization integration ─────────────────────────────────────────────

  it('student may read WBS and packages but cannot create them', async () => {
    // Admin creates WBS and package.
    const wbs = await service.createWbs(admin(), TENANT, {
      idempotencyKey: idem('auth-wbs'),
      projectId: 'proj-auth',
      title: 'Auth Test WBS',
    });
    await service.createPackage(admin(), TENANT, wbs.id, {
      idempotencyKey: idem('auth-pkg'),
      title: 'Auth Package',
    });

    // Student can list WBS.
    const list = await service.listWbs(student(), TENANT, 'proj-auth');
    expect(list.length).toBeGreaterThan(0);

    // Student can list packages.
    const packages = await service.listPackages(student(), TENANT, wbs.id);
    expect(packages.length).toBeGreaterThan(0);

    // Student cannot create WBS.
    await expect(
      service.createWbs(student(), TENANT, {
        idempotencyKey: idem('stu-wbs'),
        projectId: 'proj-auth',
        title: 'Student WBS',
      }),
    ).rejects.toThrow(ForbiddenDomainException);

    // Student cannot create packages.
    await expect(
      service.createPackage(student(), TENANT, wbs.id, {
        idempotencyKey: idem('stu-pkg'),
        title: 'Student Package',
      }),
    ).rejects.toThrow(ForbiddenDomainException);
  });
});
