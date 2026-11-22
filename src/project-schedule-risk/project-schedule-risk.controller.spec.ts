import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionService } from '../session/session.service';
import { ScheduleAuditService } from './project-schedule-risk-audit.service';
import { ProjectScheduleRiskController } from './project-schedule-risk.controller';
import { ProjectScheduleRiskRepository } from './project-schedule-risk.repository';
import { ProjectScheduleRiskService } from './project-schedule-risk.service';

const secret = 'schedule-risk-integration-secret-at-least-32';
const base = '/schedule-risk/tenants/tenant-a';

describe('ProjectScheduleRiskController HTTP integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [ProjectScheduleRiskController],
      providers: [
        ProjectScheduleRiskService,
        ProjectScheduleRiskRepository,
        ScheduleAuditService,
        JwtAuthGuard,
        RolesGuard,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: SessionService, useValue: {} },
        { provide: Reflector, useValue: new Reflector() },
      ],
    }).compile();
    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const token = (sub: string, role: string) =>
    `Bearer ${jwt.sign({ sub, email: `${sub}@example.com`, role })}`;
  const http = () => request(app.getHttpServer());
  const owner = () => token('owner-1', 'student');
  const task = (key: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: key,
    title: 'Build it',
    startDate: '2027-01-01',
    endDate: '2027-01-03',
    ...extra,
  });

  async function seed() {
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('admin-1', 'admin'))
      .send({
        projectId: 'p1',
        members: { 'owner-1': 'owner', 'viewer-1': 'viewer' },
        deadline: '2027-01-30',
      })
      .expect(201);
  }

  it('rejects anonymous callers, students and librarians registering projects', async () => {
    await http().post(`${base}/projects`).send({ projectId: 'p1' }).expect(401);
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('stu-1', 'student'))
      .send({ projectId: 'p1', members: { 'stu-1': 'owner' } })
      .expect(403);
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('lib-1', 'librarian'))
      .send({ projectId: 'p1' })
      .expect(403);
  });

  it('validates input and rejects unknown fields', async () => {
    await seed();
    const post = (payload: object) =>
      http()
        .post(`${base}/projects/p1/tasks`)
        .set('Authorization', owner())
        .send(payload);
    await post(task('short')).expect(400);
    await post(task('task-key-0001', { startDate: 'soon' })).expect(400);
    await post(task('task-key-0001', { dependsOn: 'a' })).expect(400);
    await post(task('task-key-0001', { dependsOn: ['a', 'a'] })).expect(400);
    await post(task('task-key-0001', { createdBy: 'evil' })).expect(400);
    const bad = await post(
      task('task-key-0001', { endDate: '2026-12-01' }),
    ).expect(400);
    expect(bad.body.errorCode).toBe('VAL_SCHEDULE_DATES_INVALID');
  });

  it('creates tasks, rejects a cycle with a stable code, and reports risks', async () => {
    await seed();
    const auth = owner();
    const a = await http()
      .post(`${base}/projects/p1/tasks`)
      .set('Authorization', auth)
      .send(task('task-key-0001', { assigneeId: 'dev-1' }))
      .expect(201);
    const b = await http()
      .post(`${base}/projects/p1/tasks`)
      .set('Authorization', auth)
      .send(
        task('task-key-0002', {
          dependsOn: [a.body.id],
          startDate: '2027-01-02',
          endDate: '2027-01-20',
          assigneeId: 'dev-1',
        }),
      )
      .expect(201);

    const cycle = await http()
      .patch(`${base}/tasks/${a.body.id}`)
      .set('Authorization', auth)
      .send({
        idempotencyKey: 'update-key-0001',
        expectedVersion: 1,
        dependsOn: [b.body.id],
      })
      .expect(422);
    expect(cycle.body.errorCode).toBe('BIZ_SCHEDULE_DEPENDENCY_CYCLE');
    expect(cycle.body.details.cycle).toEqual([a.body.id, b.body.id, a.body.id]);

    const stale = await http()
      .patch(`${base}/tasks/${a.body.id}`)
      .set('Authorization', auth)
      .send({
        idempotencyKey: 'update-key-0002',
        expectedVersion: 7,
        title: 'x',
      })
      .expect(409);
    expect(stale.body.errorCode).toBe('BIZ_SCHEDULE_STALE_VERSION');

    const analysis = await http()
      .get(`${base}/projects/p1/analysis?asOf=2027-01-01`)
      .set('Authorization', auth)
      .expect(200);
    expect(analysis.body.criticalPath).toEqual([a.body.id, b.body.id]);
    expect(analysis.body.findings.map((f: { code: string }) => f.code)).toEqual(
      expect.arrayContaining([
        'START_BEFORE_PREDECESSOR_END',
        'ASSIGNEE_OVERLAP',
      ]),
    );

    const asViewer = await http()
      .get(`${base}/projects/p1/analysis?asOf=2027-01-01`)
      .set('Authorization', token('viewer-1', 'student'))
      .expect(200);
    expect(JSON.stringify(asViewer.body)).not.toContain('dev-1');

    await http()
      .get(`${base}/projects/p1/analysis?asOf=whenever`)
      .set('Authorization', auth)
      .expect(400);
  });

  it('replays retried requests and runs the lifecycle', async () => {
    await seed();
    const auth = owner();
    const send = () =>
      http()
        .post(`${base}/projects/p1/tasks`)
        .set('Authorization', auth)
        .send(task('retry-key-0001'));
    const first = await send().expect(201);
    const second = await send().expect(201);
    expect(second.body.id).toBe(first.body.id);

    const skip = await http()
      .post(`${base}/tasks/${first.body.id}/transitions`)
      .set('Authorization', auth)
      .send({
        idempotencyKey: 'move-key-0001',
        expectedVersion: 1,
        status: 'done',
      })
      .expect(422);
    expect(skip.body.errorCode).toBe('BIZ_SCHEDULE_INVALID_TRANSITION');

    await http()
      .post(`${base}/tasks/${first.body.id}/transitions`)
      .set('Authorization', auth)
      .send({
        idempotencyKey: 'move-key-0002',
        expectedVersion: 1,
        status: 'in_progress',
      })
      .expect(201);
  });

  it('enforces project membership and roles', async () => {
    await seed();
    await http()
      .post(`${base}/projects/p1/tasks`)
      .set('Authorization', token('viewer-1', 'student'))
      .send(task('task-key-0001'))
      .expect(403);
    await http()
      .get(`${base}/projects/p1/tasks`)
      .set('Authorization', token('stranger', 'student'))
      .expect(404);
    await http()
      .get(`${base}/projects/p1/tasks`)
      .set('Authorization', token('viewer-1', 'student'))
      .expect(200);
    await http()
      .post(`${base}/projects/p1/analysis/snapshots`)
      .set('Authorization', token('viewer-1', 'student'))
      .send({ idempotencyKey: 'snap-key-0001' })
      .expect(403);
    await http()
      .post(`${base}/projects/p1/analysis/snapshots`)
      .set('Authorization', owner())
      .send({ idempotencyKey: 'snap-key-0001', asOf: '2027-01-01' })
      .expect(201);
  });

  it('serves audit metadata to admins only', async () => {
    await seed();
    await http()
      .post(`${base}/projects/p1/tasks`)
      .set('Authorization', owner())
      .send(task('task-key-0001'))
      .expect(201);
    await http().get(`${base}/audit`).set('Authorization', owner()).expect(403);
    const res = await http()
      .get(`${base}/audit`)
      .set('Authorization', token('admin-1', 'admin'))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('Build it');
  });

  it('rejects a token for another tenant path', async () => {
    await seed();
    await http()
      .get('/schedule-risk/tenants/tenant-b/projects/p1/tasks')
      .set('Authorization', owner())
      .expect(404);
  });
});
