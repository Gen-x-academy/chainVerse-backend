import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { makeAdminToken, makeStudentToken } from './helpers/jwt.helper';

describe('Module registration smoke tests', () => {
  let app: INestApplication;
  let server: any;
  const adminToken = makeAdminToken();
  const studentToken = makeStudentToken();
  const studentId = 'seed-student-id';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/health'] });
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/subscription-plan is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/subscription-plan')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /api/v1/reports/tutor/:id returns tutor report data', async () => {
    const tutorId = 'test-tutor-id';
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/tutor/${tutorId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      tutorId,
      totalCourses: expect.any(Number),
      averageRating: expect.any(Number),
    });
  });

  it('POST /api/v1/contact persists a contact message', async () => {
    const payload = {
      title: 'Help needed',
      description: 'I have an issue with my account.',
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      title: payload.title,
      description: payload.description,
      id: expect.any(String),
    });
  });

  it('should create a session via POST /api/v1/session with auth', async () => {
    const payload = {
      token: 'test-session-token',
      ipAddress: '127.0.0.1',
      userAgent: 'supertest',
    };

    const res = await request(server)
      .post('/api/v1/session')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(payload)
      .expect(201);

    expect(res.body).toMatchObject({
      token: payload.token,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      userId: studentId,
    });
  });

  it('should list organizations via GET /api/v1/organization', async () => {
    const res = await request(server).get('/api/v1/organization').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should list organization members via GET /api/v1/organization-member', async () => {
    const res = await request(server)
      .get('/api/v1/organization-member')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should list organization members for a user via GET /api/v1/organization-member/user/:userId', async () => {
    const res = await request(server)
      .get(`/api/v1/organization-member/user/${studentId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should cache FAQ list and invalidate it after update', async () => {
    const createRes = await request(server)
      .post('/api/faq')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Smoke Test FAQ',
        description: 'Verify cache invalidation behavior',
      })
      .expect(201);

    const faqId = createRes.body._id ?? createRes.body.id;
    expect(faqId).toBeDefined();

    const first = await request(server).get('/api/faq').expect(200);
    expect(Array.isArray(first.body)).toBe(true);
    expect(first.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Smoke Test FAQ',
        }),
      ]),
    );

    const second = await request(server).get('/api/faq').expect(200);
    expect(second.body).toEqual(first.body);

    await request(server)
      .patch(`/api/faq/${faqId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Smoke Test FAQ Updated' })
      .expect(200);

    const updated = await request(server).get('/api/faq').expect(200);
    expect(
      updated.body.some(
        (item: any) =>
          (item._id === faqId || item.id === faqId) &&
          item.title === 'Smoke Test FAQ Updated',
      ),
    ).toBe(true);
  });
});
