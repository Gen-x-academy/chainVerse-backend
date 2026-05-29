import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Module registration smoke tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
});
