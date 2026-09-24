import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { Course } from '../src/admin-course/schemas/course.schema';
import appConfig from '../src/config/app.config';
import { CourseSection } from '../src/curriculum/schemas/course-section.schema';
import { CurriculumModule } from '../src/curriculum/curriculum.module';
import { Lesson } from '../src/curriculum/schemas/lesson.schema';
import { makeAdminToken, makeTutorToken } from './helpers/jwt.helper';

/**
 * End-to-end coverage for the curriculum models (#857) and the transactional
 * reorder operation (#858), against a real MongoDB instance.
 */
describe('Course curriculum (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let courseModel: Model<Course>;
  let sectionModel: Model<CourseSection>;
  let lessonModel: Model<Lesson>;

  const OWNER_ID = 'seed-tutor-id';
  const ownerToken = makeTutorToken();
  const otherTutorToken = makeTutorToken('other-tutor-id', 'other@test.local');
  const adminToken = makeAdminToken();

  let courseId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const getCurriculum = async (token = ownerToken) => {
    const res = await request(server)
      .get(`/courses/${courseId}/curriculum`)
      .set(auth(token))
      .expect(200);
    return res.body as {
      curriculumVersion: number;
      sections: Array<{
        id: string;
        order: number;
        lessons: Array<{ id: string; order: number; sectionId: string }>;
      }>;
    };
  };

  beforeAll(async () => {
    // The curriculum module plus the infrastructure its guards need, rather
    // than the whole AppModule, so this suite exercises the routes under test
    // without booting every unrelated feature module.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        JwtModule.register({
          global: true,
          secret: process.env.JWT_SECRET,
          signOptions: { algorithm: 'HS256' },
        }),
        MongooseModule.forRoot(process.env.MONGO_URI as string),
        CurriculumModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;

    courseModel = moduleFixture.get(getModelToken(Course.name));
    sectionModel = moduleFixture.get(getModelToken(CourseSection.name));
    lessonModel = moduleFixture.get(getModelToken(Lesson.name));
  }, 60_000);

  beforeEach(async () => {
    await Promise.all([
      sectionModel.deleteMany({}).exec(),
      lessonModel.deleteMany({}).exec(),
    ]);

    const course = await courseModel.create({
      title: 'Curriculum E2E Course',
      description: 'A course used to exercise curriculum persistence',
      category: 'blockchain',
      price: 0,
      tutorId: OWNER_ID,
      tutorEmail: 'tutor@test.local',
      tutorName: 'E2E Tutor',
      status: 'draft',
    });
    courseId = String(course._id);
  });

  afterAll(async () => {
    await Promise.all([
      sectionModel.deleteMany({}).exec(),
      lessonModel.deleteMany({}).exec(),
      courseModel.deleteMany({ tutorId: OWNER_ID }).exec(),
    ]);
    await app.close();
  });

  const addSection = async (title: string): Promise<string> => {
    const res = await request(server)
      .post(`/courses/${courseId}/curriculum/sections`)
      .set(auth(ownerToken))
      .send({ title })
      .expect(201);

    const sections = res.body.sections as Array<{ id: string; title: string }>;
    return sections.find((section) => section.title === title)!.id;
  };

  const addLesson = async (
    sectionId: string,
    title: string,
    body: Record<string, unknown> = {},
  ): Promise<string> => {
    const res = await request(server)
      .post(`/courses/${courseId}/curriculum/sections/${sectionId}/lessons`)
      .set(auth(ownerToken))
      .send({ title, ...body })
      .expect(201);

    const section = (
      res.body.sections as Array<{
        id: string;
        lessons: Array<{ id: string; title: string }>;
      }>
    ).find((entry) => entry.id === sectionId)!;
    return section.lessons.find((lesson) => lesson.title === title)!.id;
  };

  describe('persistence (#857)', () => {
    it('persists sections in insertion order with stable ids', async () => {
      const first = await addSection('Fundamentals');
      const second = await addSection('Advanced');

      const curriculum = await getCurriculum();
      expect(curriculum.sections.map((s) => [s.id, s.order])).toEqual([
        [first, 0],
        [second, 1],
      ]);
    });

    it('persists lessons with validated content units', async () => {
      const sectionId = await addSection('Fundamentals');
      const lessonId = await addLesson(sectionId, 'Hashing', {
        durationMinutes: 12,
        contentUnits: [
          {
            type: 'video',
            title: 'Hashing explained',
            order: 0,
            url: 'https://cdn.test.local/hashing.mp4',
          },
          {
            type: 'article',
            title: 'Further reading',
            order: 1,
            body: 'Merkle trees are …',
          },
        ],
      });

      const stored = await lessonModel.findById(lessonId).exec();
      expect(stored).toMatchObject({ title: 'Hashing', order: 0 });
      expect(stored!.contentUnits.map((unit) => unit.type)).toEqual([
        'video',
        'article',
      ]);
    });

    it('rejects a content unit whose payload does not match its type', async () => {
      const sectionId = await addSection('Fundamentals');

      await request(server)
        .post(`/courses/${courseId}/curriculum/sections/${sectionId}/lessons`)
        .set(auth(ownerToken))
        .send({
          title: 'Broken',
          contentUnits: [{ type: 'video', title: 'No source', order: 0 }],
        })
        .expect(400);
    });

    it('closes the position gap when a lesson is deleted', async () => {
      const sectionId = await addSection('Fundamentals');
      const first = await addLesson(sectionId, 'One');
      const second = await addLesson(sectionId, 'Two');
      const third = await addLesson(sectionId, 'Three');

      await request(server)
        .delete(`/courses/${courseId}/curriculum/lessons/${second}`)
        .set(auth(ownerToken))
        .expect(200);

      const curriculum = await getCurriculum();
      expect(
        curriculum.sections[0].lessons.map((l) => [l.id, l.order]),
      ).toEqual([
        [first, 0],
        [third, 1],
      ]);
    });

    it('deletes a section together with its lessons', async () => {
      const sectionId = await addSection('Fundamentals');
      await addLesson(sectionId, 'One');

      await request(server)
        .delete(`/courses/${courseId}/curriculum/sections/${sectionId}`)
        .set(auth(ownerToken))
        .expect(200);

      await expect(
        lessonModel
          .countDocuments({ sectionId: new Types.ObjectId(sectionId) })
          .exec(),
      ).resolves.toBe(0);
    });

    it('rejects a malformed course id with 400 before Mongoose casts it', async () => {
      await request(server)
        .get('/courses/not-an-object-id/curriculum')
        .set(auth(ownerToken))
        .expect(400);
    });
  });

  describe('transactional reordering (#858)', () => {
    let sectionA: string;
    let sectionB: string;
    let lesson1: string;
    let lesson2: string;
    let lesson3: string;

    beforeEach(async () => {
      sectionA = await addSection('Fundamentals');
      sectionB = await addSection('Advanced');
      lesson1 = await addLesson(sectionA, 'One');
      lesson2 = await addLesson(sectionA, 'Two');
      lesson3 = await addLesson(sectionB, 'Three');
    });

    const reorderBody = (expectedVersion: number) => ({
      expectedVersion,
      sections: [
        { sectionId: sectionB, lessonIds: [lesson3, lesson1] },
        { sectionId: sectionA, lessonIds: [lesson2] },
      ],
    });

    it('applies the whole outline and bumps the version', async () => {
      const before = await getCurriculum();

      const res = await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send(reorderBody(before.curriculumVersion))
        .expect(200);

      expect(res.body.curriculumVersion).toBe(before.curriculumVersion + 1);
      expect(res.body.sections.map((s: { id: string }) => s.id)).toEqual([
        sectionB,
        sectionA,
      ]);
      expect(
        res.body.sections[0].lessons.map((l: { id: string }) => l.id),
      ).toEqual([lesson3, lesson1]);
      expect(
        res.body.sections[1].lessons.map((l: { id: string }) => l.id),
      ).toEqual([lesson2]);
    });

    it('leaves no duplicate or missing positions behind', async () => {
      const before = await getCurriculum();

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send(reorderBody(before.curriculumVersion))
        .expect(200);

      const sections = await sectionModel
        .find({ courseId: new Types.ObjectId(courseId) })
        .exec();
      expect(sections.map((s) => s.order).sort()).toEqual([0, 1]);

      const movedInto = await lessonModel
        .find({ sectionId: new Types.ObjectId(sectionB) })
        .exec();
      expect(movedInto.map((l) => l.order).sort()).toEqual([0, 1]);
    });

    it('rejects a stale version with 409 and changes nothing', async () => {
      const before = await getCurriculum();

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send(reorderBody(before.curriculumVersion))
        .expect(200);

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send({
          expectedVersion: before.curriculumVersion,
          sections: [
            { sectionId: sectionA, lessonIds: [lesson1, lesson2, lesson3] },
            { sectionId: sectionB, lessonIds: [] },
          ],
        })
        .expect(409);

      const after = await getCurriculum();
      expect(after.sections.map((s) => s.id)).toEqual([sectionB, sectionA]);
    });

    it('lets exactly one of two concurrent reorders win', async () => {
      const before = await getCurriculum();

      const results = await Promise.all([
        request(server)
          .put(`/courses/${courseId}/curriculum/reorder`)
          .set(auth(ownerToken))
          .send(reorderBody(before.curriculumVersion)),
        request(server)
          .put(`/courses/${courseId}/curriculum/reorder`)
          .set(auth(ownerToken))
          .send({
            expectedVersion: before.curriculumVersion,
            sections: [
              { sectionId: sectionA, lessonIds: [lesson3] },
              { sectionId: sectionB, lessonIds: [lesson1, lesson2] },
            ],
          }),
      ]);

      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409]);

      const after = await getCurriculum();
      expect(after.curriculumVersion).toBe(before.curriculumVersion + 1);

      const allLessons = await lessonModel
        .find({ courseId: new Types.ObjectId(courseId) })
        .exec();
      expect(allLessons).toHaveLength(3);
      const positions = allLessons.map(
        (l) => `${String(l.sectionId)}:${l.order}`,
      );
      expect(new Set(positions).size).toBe(positions.length);
    });

    it('rejects a payload that does not list every lesson', async () => {
      const before = await getCurriculum();

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send({
          expectedVersion: before.curriculumVersion,
          sections: [
            { sectionId: sectionA, lessonIds: [lesson1] },
            { sectionId: sectionB, lessonIds: [lesson3] },
          ],
        })
        .expect(400);
    });

    it('rejects a lesson id that belongs to no section of this course', async () => {
      const before = await getCurriculum();

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(ownerToken))
        .send({
          expectedVersion: before.curriculumVersion,
          sections: [
            { sectionId: sectionA, lessonIds: [lesson1, lesson2] },
            {
              sectionId: sectionB,
              lessonIds: [lesson3, '507f1f77bcf86cd799439011'],
            },
          ],
        })
        .expect(400);
    });

    it('refuses a tutor who does not own the course', async () => {
      const before = await getCurriculum();

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(otherTutorToken))
        .send(reorderBody(before.curriculumVersion))
        .expect(403);
    });

    it('allows an admin to reorder any course', async () => {
      const before = await getCurriculum(adminToken);

      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .set(auth(adminToken))
        .send(reorderBody(before.curriculumVersion))
        .expect(200);
    });

    it('requires authentication', async () => {
      await request(server)
        .put(`/courses/${courseId}/curriculum/reorder`)
        .send(reorderBody(0))
        .expect(401);
    });
  });
});
