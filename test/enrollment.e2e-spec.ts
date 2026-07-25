import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { Server } from 'http';
import { AppModule } from '../src/app.module';
import { Student } from '../src/student-auth/schemas/student.schema';
import { Course } from '../src/admin-course/schemas/course.schema';
import { Enrollment } from '../src/student-enrollment/schemas/enrollment.schema';
import { CartItem } from '../src/student-cart/schemas/cart-item.schema';

/**
 * E2E test for the course enrollment flow:
 *   browse courses → add to cart → enroll free → access content
 */
describe('Enrollment – E2E flow (#538)', () => {
  let app: INestApplication;
  let server: Server;
  let studentModel: Model<Student>;
  let courseModel: Model<Course>;
  let enrollmentModel: Model<Enrollment>;
  let cartItemModel: Model<CartItem>;

  const EMAIL = `e2e.enroll.${Date.now()}@example.com`;
  const PASSWORD = 'EnrollPass1!';
  let accessToken: string;
  let courseId: string;

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

    studentModel = moduleFixture.get<Model<Student>>(getModelToken(Student.name));
    courseModel = moduleFixture.get<Model<Course>>(getModelToken(Course.name));
    enrollmentModel = moduleFixture.get<Model<Enrollment>>(getModelToken(Enrollment.name));
    cartItemModel = moduleFixture.get<Model<CartItem>>(getModelToken(CartItem.name));

    // Seed a published free course directly in DB
    const course = await courseModel.create({
      title: 'E2E Free Course',
      description: 'Course for e2e enrollment testing',
      category: 'test',
      price: 0,
      tutorId: 'e2e-tutor-id',
      tutorEmail: 'tutor@e2e.test',
      tutorName: 'E2E Tutor',
      status: 'published',
    });
    courseId = (course as any)._id.toString();

    // Register + verify + login
    await request(server)
      .post('/student/register')
      .send({ firstName: 'Enroll', lastName: 'User', email: EMAIL, password: PASSWORD });

    const student = await studentModel.findOne({ email: EMAIL }).exec();
    if (student?.verificationToken) {
      await request(server)
        .post('/student/verify-email')
        .send({ token: student.verificationToken });
    }

    const loginRes = await request(server)
      .post('/student/login')
      .send({ email: EMAIL, password: PASSWORD });
    accessToken = loginRes.body.accessToken as string;
  });

  afterAll(async () => {
    const student = await studentModel.findOne({ email: EMAIL }).exec();
    if (student) {
      await enrollmentModel.deleteMany({ studentId: student.id }).exec();
      await cartItemModel.deleteMany({ studentId: student.id }).exec();
      await studentModel.deleteOne({ email: EMAIL }).exec();
    }
    await courseModel.deleteOne({ title: 'E2E Free Course' }).exec();
    await app.close();
  });

  // 1. Browse courses — list with pagination
  it('GET /courses → 200, list with pagination', async () => {
    const res = await request(server).get('/courses').expect(200);
    expect(res.body).toHaveProperty('courses');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.courses)).toBe(true);
  });

  // 2. Add to cart
  it('POST /student/cart → 200/201, item added', async () => {
    const res = await request(server)
      .post('/student/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ courseId })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
        }
      });

    expect(res.body).toBeDefined();
  });

  // 3. Enroll in free course
  it('POST /student/enrollment/free/:courseId → 201', async () => {
    const res = await request(server)
      .post(`/student/enrollment/free/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(res.body).toBeDefined();
  });

  // 4. Get my courses — includes the enrolled course
  it('GET /student/enrollment/my-courses → 200, includes enrolled course', async () => {
    const res = await request(server)
      .get('/student/enrollment/my-courses')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const enrolled = (res.body as any[]).some(
      (item) => item.course?.id === courseId || item.enrollment?.courseId === courseId,
    );
    expect(enrolled).toBe(true);
  });

  // 5. Check is-enrolled
  it(`GET /student/enrollment/is-enrolled/:courseId → { isEnrolled: true }`, async () => {
    const res = await request(server)
      .get(`/student/enrollment/is-enrolled/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.isEnrolled ?? res.body.enrolled).toBe(true);
  });

  // 6. Access course content
  it('GET /student/enrollment/content/:courseId → 200, course content', async () => {
    const res = await request(server)
      .get(`/student/enrollment/content/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toBeDefined();
  });

  // 7. Access content without auth → 401
  it('GET /student/enrollment/content/:courseId without token → 401', async () => {
    await request(server)
      .get(`/student/enrollment/content/${courseId}`)
      .expect(401);
  });

  // 8. Enroll in non-existent course → 404
  it('POST /student/enrollment/free/invalid-id → 404', async () => {
    await request(server)
      .post('/student/enrollment/free/000000000000000000000000')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // 9. Re-enroll in same free course → 409
  it('POST /student/enrollment/free/:courseId again → 409 conflict', async () => {
    await request(server)
      .post(`/student/enrollment/free/${courseId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);
  });
});
