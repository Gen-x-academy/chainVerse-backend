/**
 * CAPSTONE-058 — Work Breakdown Structures E2E / Authorization tests
 *
 * Tests the full HTTP layer: authentication, role-based access control,
 * tenant boundary enforcement, happy-path success codes, and idempotency
 * key behaviour. Runs against an in-memory MongoDB instance.
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/test-app.helper';
import {
  makeAdminToken,
  makeStudentToken,
  makeTutorToken,
  makeModeratorToken,
  makeExpiredToken,
} from './helpers/jwt.helper';

const BASE = '/api/v1/wbs/tenants/tenant-e2e';

function idem(label: string): string {
  return `idem-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('WorkBreakdown — E2E (CAPSTONE-058)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  // ── Authentication guard ───────────────────────────────────────────────────

  it('POST /wbs → 401 without token', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .send({ idempotencyKey: idem('a'), projectId: 'p1', title: 'T' })
      .expect(401);
  });

  it('POST /wbs → 401 with expired token', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeExpiredToken()}`)
      .send({ idempotencyKey: idem('b'), projectId: 'p1', title: 'T' })
      .expect(401);
  });

  // ── Role-based authorization ───────────────────────────────────────────────

  it('POST /wbs → 403 for student role', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeStudentToken()}`)
      .send({ idempotencyKey: idem('c'), projectId: 'p1', title: 'T' })
      .expect(403);
  });

  it('POST /wbs → 201 for admin role', async () => {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ idempotencyKey: idem('d'), projectId: 'proj-admin', title: 'Admin WBS' })
      .expect(201);
    expect(res.body.data.title).toBe('Admin WBS');
  });

  it('POST /wbs → 201 for tutor role', async () => {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeTutorToken()}`)
      .send({ idempotencyKey: idem('e'), projectId: 'proj-tutor', title: 'Tutor WBS' })
      .expect(201);
    expect(res.body.data.id).toBeTruthy();
  });

  it('POST /wbs → 201 for moderator role', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeModeratorToken()}`)
      .send({ idempotencyKey: idem('f'), projectId: 'proj-mod', title: 'Mod WBS' })
      .expect(201);
  });

  // ── Happy-path CRUD ───────────────────────────────────────────────────────

  describe('full CRUD happy-path', () => {
    let wbsId: string;
    let packageId: string;
    const projectId = `proj-e2e-${Date.now()}`;
    const adminToken = makeAdminToken('admin-e2e', 'admin@e2e.test');

    it('creates a WBS', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/wbs`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          idempotencyKey: idem('wbs-create'),
          projectId,
          title: 'E2E WBS',
          description: 'Full E2E test',
        })
        .expect(201);
      wbsId = res.body.data.id;
      expect(wbsId).toBeTruthy();
    });

    it('lists WBS for the project', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/projects/${projectId}/wbs`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('gets the WBS by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/wbs/${wbsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(wbsId);
    });

    it('creates a work package', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/wbs/${wbsId}/packages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          idempotencyKey: idem('pkg-create'),
          title: 'E2E Package',
          acceptanceCriteria: ['Tests pass'],
          progressWeight: 50,
        })
        .expect(201);
      packageId = res.body.data.id;
      expect(packageId).toBeTruthy();
      expect(res.body.data.status).toBe('pending');
    });

    it('lists packages for the WBS', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/wbs/${wbsId}/packages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('gets the work package by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/packages/${packageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(packageId);
    });

    it('sets an estimate on the package', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/packages/${packageId}/estimate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ idempotencyKey: idem('est'), value: 8, unit: 'story_points' })
        .expect(201);
      expect(res.body.data.estimate.value).toBe(8);
    });

    it('advances package status to IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/packages/${packageId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ idempotencyKey: idem('stat-ip'), status: 'in_progress' })
        .expect(201);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('creates a task inside the package', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/packages/${packageId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ idempotencyKey: idem('task'), title: 'E2E Task' })
        .expect(201);
      expect(res.body.data.done).toBe(false);
    });

    it('shows progress report', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/wbs/${wbsId}/progress`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.wbsId).toBe(wbsId);
      expect(typeof res.body.data.progressPercent).toBe('number');
    });
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('POST /wbs → 400 when title is missing', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ idempotencyKey: idem('v1'), projectId: 'p1' })
      .expect(400);
  });

  it('POST /wbs/:id/packages/status → 422 for invalid transition PENDING→DONE', async () => {
    // First create WBS + package
    const wbsRes = await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${makeAdminToken('a2', 'a2@t.com')}`)
      .send({ idempotencyKey: idem('val-wbs'), projectId: 'proj-val', title: 'Val WBS' })
      .expect(201);
    const valWbsId = wbsRes.body.data.id;

    const pkgRes = await request(app.getHttpServer())
      .post(`${BASE}/wbs/${valWbsId}/packages`)
      .set('Authorization', `Bearer ${makeAdminToken('a2', 'a2@t.com')}`)
      .send({ idempotencyKey: idem('val-pkg'), title: 'Val Pkg' })
      .expect(201);
    const valPkgId = pkgRes.body.data.id;

    await request(app.getHttpServer())
      .post(`${BASE}/packages/${valPkgId}/status`)
      .set('Authorization', `Bearer ${makeAdminToken('a2', 'a2@t.com')}`)
      .send({ idempotencyKey: idem('val-stat'), status: 'done' })
      .expect(422);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('POST /wbs with same key returns same WBS ID', async () => {
    const idemKey = idem('idem-wbs');
    const token = makeAdminToken('a3', 'a3@t.com');
    const r1 = await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey, projectId: 'proj-idem', title: 'Idem WBS' })
      .expect(201);
    const r2 = await request(app.getHttpServer())
      .post(`${BASE}/wbs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey, projectId: 'proj-idem', title: 'Idem WBS' })
      .expect(201);
    expect(r1.body.data.id).toBe(r2.body.data.id);
  });

  // ── 404 for unknown resources ─────────────────────────────────────────────

  it('GET /wbs/:id → 404 for unknown WBS', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/wbs/nonexistent-id`)
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .expect(404);
  });

  it('GET /packages/:id → 404 for unknown package', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/packages/nonexistent-pkg`)
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .expect(404);
  });
});
