import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionService } from '../session/session.service';
import { ObjectivesAuditService } from './project-objectives-audit.service';
import { ProjectObjectivesController } from './project-objectives.controller';
import { ProjectObjectivesRepository } from './project-objectives.repository';
import { ProjectObjectivesService } from './project-objectives.service';

const secret = 'objectives-integration-secret-at-least-32';
const base = '/objectives/tenants/tenant-a';

describe('ProjectObjectivesController HTTP integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [ProjectObjectivesController],
      providers: [
        ProjectObjectivesService,
        ProjectObjectivesRepository,
        ObjectivesAuditService,
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
  const body = (key: string, extra: Record<string, unknown> = {}) => ({
    idempotencyKey: key,
    title: 'Ship the MVP',
    priority: 'high',
    ownerId: 'owner-1',
    unit: 'features',
    direction: 'increase',
    baseline: 0,
    target: 10,
    startDate: '2027-01-01',
    targetDate: '2027-06-30',
    visibility: 'public',
    charterReference: 'charter-v1',
    criteria: [{ label: 'All shipped', threshold: 10 }],
    ...extra,
  });

  async function seed() {
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('admin-1', 'admin'))
      .send({
        projectId: 'p1',
        members: { 'owner-1': 'owner', 'viewer-1': 'viewer' },
      })
      .expect(201);
  }

  it('rejects anonymous callers, librarians and students registering projects', async () => {
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
    const owner = token('owner-1', 'student');
    const post = (payload: object) =>
      http()
        .post(`${base}/projects/p1/objectives`)
        .set('Authorization', owner)
        .send(payload);
    await post(body('short')).expect(400);
    await post(body('obj-key-0001', { priority: 'urgent' })).expect(400);
    await post(body('obj-key-0001', { baseline: 'zero' })).expect(400);
    await post(body('obj-key-0001', { createdBy: 'evil' })).expect(400);
    await post(body('obj-key-0001', { target: 0 })).expect(400);
  });

  it('runs create → activate → progress → achieve, with stable errors', async () => {
    await seed();
    const owner = token('owner-1', 'student');
    const created = await http()
      .post(`${base}/projects/p1/objectives`)
      .set('Authorization', owner)
      .send(body('obj-key-0001'))
      .expect(201);

    await http()
      .post(`${base}/objectives/${created.body.id}/transitions`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'move-key-001',
        status: 'achieved',
        expectedVersion: 1,
      })
      .expect(422);
    await http()
      .post(`${base}/objectives/${created.body.id}/transitions`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'move-key-002',
        status: 'active',
        expectedVersion: 1,
      })
      .expect(201);
    await http()
      .post(`${base}/objectives/${created.body.id}/transitions`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'move-key-003',
        status: 'abandoned',
        expectedVersion: 1,
      })
      .expect(409);
    await http()
      .post(`${base}/objectives/${created.body.id}/progress`)
      .set('Authorization', owner)
      .send({ idempotencyKey: 'prog-key-0001', value: 10 })
      .expect(201);
    const done = await http()
      .post(`${base}/objectives/${created.body.id}/transitions`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'move-key-004',
        status: 'achieved',
        expectedVersion: 3,
      })
      .expect(201);
    expect(done.body).toMatchObject({
      status: 'achieved',
      progressPercent: 100,
    });
  });

  it('enforces visibility over HTTP', async () => {
    await seed();
    const owner = token('owner-1', 'student');
    const outsider = token('outsider-1', 'student');
    const pub = await http()
      .post(`${base}/projects/p1/objectives`)
      .set('Authorization', owner)
      .send(body('obj-key-0001'))
      .expect(201);
    const priv = await http()
      .post(`${base}/projects/p1/objectives`)
      .set('Authorization', owner)
      .send(
        body('obj-key-0002', {
          visibility: 'private',
          ownerId: 'owner-1',
          title: 'Secret',
        }),
      )
      .expect(201);

    const minimal = await http()
      .get(`${base}/objectives/${pub.body.id}`)
      .set('Authorization', outsider)
      .expect(200);
    expect(minimal.body.detailed).toBe(false);
    expect(minimal.body).not.toHaveProperty('baseline');
    await http()
      .get(`${base}/objectives/${priv.body.id}`)
      .set('Authorization', outsider)
      .expect(404);
    const list = await http()
      .get(`${base}/projects/p1/objectives`)
      .set('Authorization', outsider)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await http()
      .post(`${base}/projects/p1/objectives`)
      .set('Authorization', token('viewer-1', 'student'))
      .send(body('obj-key-0003'))
      .expect(403);
  });

  it('keeps audit admin-only', async () => {
    await seed();
    await http()
      .get(`${base}/audit`)
      .set('Authorization', token('owner-1', 'student'))
      .expect(403);
    await http()
      .get(`${base}/audit`)
      .set('Authorization', token('admin-1', 'admin'))
      .expect(200);
  });
});
