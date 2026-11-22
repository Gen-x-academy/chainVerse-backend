import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionService } from '../session/session.service';
import { ConductAuditService } from './capstone-conduct-audit.service';
import { CapstoneConductController } from './capstone-conduct.controller';
import { CapstoneConductRepository } from './capstone-conduct.repository';
import { CapstoneConductService } from './capstone-conduct.service';

const secret = 'conduct-integration-secret-at-least-32-chars';
const base = '/capstone-conduct/tenants/tenant-a';

describe('CapstoneConductController HTTP integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [CapstoneConductController],
      providers: [
        CapstoneConductService,
        CapstoneConductRepository,
        ConductAuditService,
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

  const policyBody = (key: string) => ({
    idempotencyKey: key,
    title: 'Code of Conduct',
    contentDigest: 'b'.repeat(64),
    tracks: ['capstone'],
  });

  it('rejects anonymous callers and non-admin publishers', async () => {
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .send(policyBody('http-publish-1'))
      .expect(401);
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', token('stu-1', 'student'))
      .send(policyBody('http-publish-1'))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', token('lib-1', 'librarian'))
      .send(policyBody('http-publish-1'))
      .expect(403);
  });

  it('validates input and rejects unknown fields', async () => {
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', token('admin-1', 'admin'))
      .send({ ...policyBody('http-publish-1'), contentDigest: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', token('admin-1', 'admin'))
      .send({ ...policyBody('http-publish-1'), extra: true })
      .expect(400);
  });

  it('runs publish → stale ack → ack → status end to end', async () => {
    const admin = token('admin-1', 'admin');
    const stu = token('stu-1', 'student');
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', admin)
      .send(policyBody('http-publish-1'))
      .expect(201);

    await request(app.getHttpServer())
      .post(`${base}/acknowledgements`)
      .set('Authorization', stu)
      .send({
        idempotencyKey: 'http-ack-0001',
        track: 'capstone',
        policyVersion: 5,
      })
      .expect(422)
      .expect((res) => {
        expect(res.body.errorCode ?? res.body.message?.errorCode).toBeDefined();
      });

    await request(app.getHttpServer())
      .post(`${base}/acknowledgements`)
      .set('Authorization', stu)
      .send({
        idempotencyKey: 'http-ack-0002',
        track: 'capstone',
        policyVersion: 1,
      })
      .expect(201);

    const status = await request(app.getHttpServer())
      .get(`${base}/status?track=capstone`)
      .set('Authorization', stu)
      .expect(200);
    expect(status.body).toMatchObject({ standing: 'current', compliant: true });

    await request(app.getHttpServer())
      .get(`${base}/status?track=bogus`)
      .set('Authorization', stu)
      .expect(400);
  });

  it('keeps breach references and audit restricted', async () => {
    const admin = token('admin-1', 'admin');
    const stu = token('stu-1', 'student');
    await request(app.getHttpServer())
      .post(`${base}/policies`)
      .set('Authorization', admin)
      .send(policyBody('http-publish-1'))
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`${base}/breaches`)
      .set('Authorization', admin)
      .send({
        idempotencyKey: 'http-breach-01',
        caseReference: 'CASE-1234',
        subjectUserId: 'stu-1',
        track: 'capstone',
        policyVersion: 1,
        severity: 'major',
      })
      .expect(201);
    expect(created.body).not.toHaveProperty('recordedBy');

    for (const path of [
      'breaches',
      `breaches/${created.body.id}`,
      'audit',
      'policies',
    ]) {
      await request(app.getHttpServer())
        .get(`${base}/${path}`)
        .set('Authorization', stu)
        .expect(403);
    }
    await request(app.getHttpServer())
      .post(`${base}/breaches/${created.body.id}/transitions`)
      .set('Authorization', admin)
      .send({ idempotencyKey: 'http-trans-001', status: 'upheld' })
      .expect(422);
  });
});
