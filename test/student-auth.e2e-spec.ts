import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { Server } from 'http';
import { AppModule } from '../src/app.module';
import { Student } from '../src/student-auth/schemas/student.schema';

/**
 * E2E test for the full student auth flow:
 *   register → verify-email → login → access protected route →
 *   refresh tokens → verify old refresh token is revoked
 */
describe('Student Auth – E2E flow (#537)', () => {
  let app: INestApplication;
  let server: Server;
  let studentModel: Model<Student>;

  const EMAIL = `e2e.auth.${Date.now()}@example.com`;
  const PASSWORD = 'SecurePass1!';

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    studentModel = moduleFixture.get<Model<Student>>(
      getModelToken(Student.name),
    );
  });

  afterAll(async () => {
    await studentModel.deleteOne({ email: EMAIL }).exec();
    await app.close();
  });

  // 1. Register
  it('POST /student/register → 201, email queued', async () => {
    const res = await request(server)
      .post('/student/register')
      .send({ firstName: 'E2E', lastName: 'User', email: EMAIL, password: PASSWORD })
      .expect(201);

    expect(res.body.message).toMatch(/verify your email/i);
    expect(res.body.user?.email).toBe(EMAIL);
    expect(res.body.user?.emailVerified).toBe(false);
  });

  // 2. Verify email using token stored in DB
  it('POST /student/verify-email with token → 200', async () => {
    const student = await studentModel.findOne({ email: EMAIL }).exec();
    expect(student?.verificationToken).toBeTruthy();

    await request(server)
      .post('/student/verify-email')
      .send({ token: student!.verificationToken })
      .expect(200);

    const verified = await studentModel.findOne({ email: EMAIL }).exec();
    expect(verified?.emailVerified).toBe(true);
  });

  // 3. Login
  it('POST /student/login → 200, returns accessToken + refreshToken', async () => {
    const res = await request(server)
      .post('/student/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    accessToken = res.body.accessToken as string;
    refreshToken = res.body.refreshToken as string;
  });

  // 4. Access protected route with valid accessToken
  it('GET /student/enrollment/my-courses with accessToken → 200', () =>
    request(server)
      .get('/student/enrollment/my-courses')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200));

  // 5. Refresh tokens
  it('POST /student/refresh-token → 200, issues new token pair', async () => {
    const res = await request(server)
      .post('/student/refresh-token')
      .send({ refreshToken })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    // Store the new tokens for the next assertion
    accessToken = res.body.accessToken as string;
    const newRefreshToken: string = res.body.refreshToken as string;

    // 6. Old refresh token must be rejected (token rotation)
    await request(server)
      .post('/student/refresh-token')
      .send({ refreshToken })
      .expect(401);

    refreshToken = newRefreshToken;
  });
});
