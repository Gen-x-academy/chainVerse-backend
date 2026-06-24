import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/test-app';
import { generateToken } from '../utils/auth-helper';

describe('Admin Access Control (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const endpoint = '/admin/dashboard';

  it('allows ADMIN', async () => {
    const token = generateToken('ADMIN');

    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('denies STUDENT', async () => {
    const token = generateToken('STUDENT');

    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('denies missing token', async () => {
    await request(app.getHttpServer()).get(endpoint).expect(401);
  });
});
