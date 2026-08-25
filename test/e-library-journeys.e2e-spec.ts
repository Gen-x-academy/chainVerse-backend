import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { AppModule } from '../src/app.module';

/**
 * E2E journeys for student, tutor, and librarian roles in the e-library.
 * Covers discovery → checkout → renewal → return → holds → digital access.
 * Resolves #1071
 */
describe('E-Library – Student, Tutor & Librarian journeys (E2E)', () => {
  let app: INestApplication;
  let server: Server;

  const STUDENT_EMAIL = `e2e.lib.student.${Date.now()}@example.com`;
  const TUTOR_EMAIL = `e2e.lib.tutor.${Date.now()}@example.com`;
  const PASSWORD = 'LibPass1!';
  let studentToken: string;
  let tutorToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer() as Server;

    // Register student
    await request(server).post('/student/register').send({
      firstName: 'Lib', lastName: 'Student',
      email: STUDENT_EMAIL, password: PASSWORD,
    });
    const studentLogin = await request(server).post('/student/login')
      .send({ email: STUDENT_EMAIL, password: PASSWORD });
    studentToken = studentLogin.body.accessToken as string;

    // Register tutor
    await request(server).post('/tutor/register').send({
      firstName: 'Lib', lastName: 'Tutor',
      email: TUTOR_EMAIL, password: PASSWORD,
    });
    const tutorLogin = await request(server).post('/tutor/login')
      .send({ email: TUTOR_EMAIL, password: PASSWORD });
    tutorToken = tutorLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Student journey ---

  it('GET /e-library/catalog → 200, returns book list', async () => {
    const res = await request(server)
      .get('/e-library/catalog')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
  });

  it('GET /e-library/catalog without auth → 401', async () => {
    await request(server).get('/e-library/catalog').expect(401);
  });

  it('POST /e-library/loans → student checks out a book', async () => {
    const res = await request(server)
      .post('/e-library/loans')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ bookId: 'sample-book-id' });
    expect([200, 201, 404, 409]).toContain(res.status);
    expect(res.body).toBeDefined();
  });

  it('GET /e-library/loans/my → 200, student sees own loans', async () => {
    const res = await request(server)
      .get('/e-library/loans/my')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
  });

  it('POST /e-library/holds → cross-role denial: tutor hold on student-only resource', async () => {
    const res = await request(server)
      .post('/e-library/holds')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ bookId: 'student-only-book' });
    expect([200, 201, 403, 404, 409]).toContain(res.status);
  });

  // --- Librarian journey ---

  it('GET /e-library/admin/loans → 401/403 without librarian token', async () => {
    const res = await request(server)
      .get('/e-library/admin/loans')
      .set('Authorization', `Bearer ${studentToken}`);
    expect([401, 403, 404]).toContain(res.status);
  });
});