import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { createTestApp } from '../utils/test-app';

describe('Authorization Edge Cases', () => {
  let app;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const endpoint = '/admin/dashboard';

  it('rejects expired token', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user', role: 'ADMIN' },
      'test_secret',
      { expiresIn: '-1h' },
    );

    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('rejects malformed token', async () => {
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer invalid_token`)
      .expect(401);
  });
});
