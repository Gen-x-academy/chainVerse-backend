import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Course } from '../admin-course/schemas/course.schema';
import { Role } from '../common/enums/role.enum';
import { CurriculumService } from './curriculum.service';
import { CourseSection } from './schemas/course-section.schema';
import { Lesson } from './schemas/lesson.schema';

const oid = () => new Types.ObjectId().toHexString();

const COURSE_ID = oid();
const SECTION_A = oid();
const SECTION_B = oid();
const LESSON_1 = oid();
const LESSON_2 = oid();
const LESSON_3 = oid();

const TUTOR = { id: 'tutor-1', role: Role.TUTOR };

/** A query mock that answers .exec(), .sort().exec() and .session().exec(). */
const chain = <T>(value: T) => {
  const link: Record<string, unknown> = {
    exec: jest.fn().mockResolvedValue(value),
  };
  link.sort = jest.fn().mockReturnValue(link);
  link.session = jest.fn().mockReturnValue(link);
  return link;
};

const courseDoc = (over: Record<string, unknown> = {}) => ({
  id: COURSE_ID,
  tutorId: TUTOR.id,
  deletedAt: null,
  curriculumVersion: 3,
  ...over,
});

const sectionDoc = (id: string, order: number) => ({
  id,
  _id: new Types.ObjectId(id),
  courseId: new Types.ObjectId(COURSE_ID),
  title: `Section ${order}`,
  description: null,
  order,
});

const lessonDoc = (id: string, sectionId: string, order: number) => ({
  id,
  _id: new Types.ObjectId(id),
  courseId: new Types.ObjectId(COURSE_ID),
  sectionId: new Types.ObjectId(sectionId),
  title: `Lesson ${order}`,
  description: null,
  order,
  contentUnits: [],
  durationMinutes: 0,
  isPreview: false,
  status: 'draft' as const,
});

describe('CurriculumService', () => {
  let service: CurriculumService;
  let courseModel: any;
  let sectionModel: any;
  let lessonModel: any;
  let session: any;
  let connection: any;

  const sections = () => [sectionDoc(SECTION_A, 0), sectionDoc(SECTION_B, 1)];
  const lessons = () => [
    lessonDoc(LESSON_1, SECTION_A, 0),
    lessonDoc(LESSON_2, SECTION_A, 1),
    lessonDoc(LESSON_3, SECTION_B, 0),
  ];

  beforeEach(async () => {
    courseModel = {
      findById: jest.fn().mockReturnValue(chain(courseDoc())),
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue(chain(courseDoc({ curriculumVersion: 4 }))),
      updateOne: jest.fn().mockReturnValue(chain(null)),
    };
    sectionModel = {
      find: jest.fn().mockReturnValue(chain(sections())),
      findOne: jest.fn().mockReturnValue(chain(null)),
      create: jest.fn().mockResolvedValue([sectionDoc(SECTION_A, 0)]),
      bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
      deleteOne: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
      deleteMany: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
    };
    lessonModel = {
      find: jest.fn().mockReturnValue(chain(lessons())),
      findOne: jest.fn().mockReturnValue(chain(null)),
      create: jest.fn().mockResolvedValue([lessonDoc(LESSON_1, SECTION_A, 0)]),
      bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
      deleteOne: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
      deleteMany: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
    };
    session = {
      withTransaction: jest.fn(async (work: () => Promise<unknown>) => work()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(CourseSection.name), useValue: sectionModel },
        { provide: getModelToken(Lesson.name), useValue: lessonModel },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get(CurriculumService);
  });

  const fullPayload = (expectedVersion = 3) => ({
    expectedVersion,
    sections: [
      { sectionId: SECTION_B, lessonIds: [LESSON_3, LESSON_1] },
      { sectionId: SECTION_A, lessonIds: [LESSON_2] },
    ],
  });

  describe('authorization', () => {
    it('refuses a tutor who does not own the course', async () => {
      courseModel.findById.mockReturnValue(
        chain(courseDoc({ tutorId: 'someone-else' })),
      );

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).rejects.toThrow(ForbiddenException);
      expect(sectionModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('lets an admin reorder a course they do not own', async () => {
      courseModel.findById.mockReturnValue(
        chain(courseDoc({ tutorId: 'someone-else' })),
      );

      await expect(
        service.reorder(COURSE_ID, fullPayload(), {
          id: 'admin-1',
          role: Role.ADMIN,
        }),
      ).resolves.toBeDefined();
    });

    it('reports a missing course as 404', async () => {
      courseModel.findById.mockReturnValue(chain(null));

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('treats a soft-deleted course as missing', async () => {
      courseModel.findById.mockReturnValue(
        chain(courseDoc({ deletedAt: new Date() })),
      );

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('optimistic concurrency', () => {
    it('claims the expected version before moving anything', async () => {
      await service.reorder(COURSE_ID, fullPayload(3), TUTOR);

      expect(courseModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ curriculumVersion: 3 }),
        { $inc: { curriculumVersion: 1 } },
        expect.objectContaining({ returnDocument: 'after' }),
      );

      const claimOrder =
        courseModel.findOneAndUpdate.mock.invocationCallOrder[0];
      const firstWriteOrder =
        sectionModel.bulkWrite.mock.invocationCallOrder[0];
      expect(claimOrder).toBeLessThan(firstWriteOrder);
    });

    it('rejects a stale version with 409 and writes nothing', async () => {
      courseModel.findOneAndUpdate.mockReturnValue(chain(null));

      await expect(
        service.reorder(COURSE_ID, fullPayload(2), TUTOR),
      ).rejects.toThrow(ConflictException);

      expect(sectionModel.bulkWrite).not.toHaveBeenCalled();
      expect(lessonModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('accepts version 0 for courses written before the field existed', async () => {
      await service.reorder(COURSE_ID, fullPayload(0), TUTOR);

      expect(courseModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { curriculumVersion: 0 },
            { curriculumVersion: { $exists: false } },
          ],
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('payload validation', () => {
    it('rejects a payload that omits a lesson', async () => {
      await expect(
        service.reorder(
          COURSE_ID,
          {
            expectedVersion: 3,
            sections: [
              { sectionId: SECTION_A, lessonIds: [LESSON_1] },
              { sectionId: SECTION_B, lessonIds: [LESSON_3] },
            ],
          },
          TUTOR,
        ),
      ).rejects.toThrow(/missing/i);
      expect(courseModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects a payload that omits a section', async () => {
      await expect(
        service.reorder(
          COURSE_ID,
          {
            expectedVersion: 3,
            sections: [
              {
                sectionId: SECTION_A,
                lessonIds: [LESSON_1, LESSON_2, LESSON_3],
              },
            ],
          },
          TUTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a lesson listed twice', async () => {
      await expect(
        service.reorder(
          COURSE_ID,
          {
            expectedVersion: 3,
            sections: [
              { sectionId: SECTION_A, lessonIds: [LESSON_1, LESSON_2] },
              { sectionId: SECTION_B, lessonIds: [LESSON_1, LESSON_3] },
            ],
          },
          TUTOR,
        ),
      ).rejects.toThrow(/duplicate/i);
    });

    it('rejects an id belonging to another course', async () => {
      const foreign = oid();

      await expect(
        service.reorder(
          COURSE_ID,
          {
            expectedVersion: 3,
            sections: [
              { sectionId: SECTION_A, lessonIds: [LESSON_1, LESSON_2] },
              { sectionId: SECTION_B, lessonIds: [LESSON_3, foreign] },
            ],
          },
          TUTOR,
        ),
      ).rejects.toThrow(/unknown lesson id/i);
    });
  });

  describe('write plan', () => {
    it('stages positions away before landing them, so unique indexes cannot fire', async () => {
      await service.reorder(COURSE_ID, fullPayload(), TUTOR);

      const [sectionStaging] = sectionModel.bulkWrite.mock.calls[0];
      const [sectionFinal] = sectionModel.bulkWrite.mock.calls[1];

      expect(
        sectionStaging.map(
          (op: any) => op.updateOne.update.$set.order as number,
        ),
      ).toEqual([1_000_000, 1_000_001]);
      expect(
        sectionFinal.map((op: any) => op.updateOne.update.$set.order as number),
      ).toEqual([0, 1]);
    });

    it('writes the submitted order and reparents moved lessons', async () => {
      await service.reorder(COURSE_ID, fullPayload(), TUTOR);

      const [lessonFinal] = lessonModel.bulkWrite.mock.calls[1];
      expect(
        lessonFinal.map((op: any) => ({
          id: op.updateOne.filter._id.toHexString(),
          sectionId: op.updateOne.update.$set.sectionId.toHexString(),
          order: op.updateOne.update.$set.order,
        })),
      ).toEqual([
        { id: LESSON_3, sectionId: SECTION_B, order: 0 },
        { id: LESSON_1, sectionId: SECTION_B, order: 1 },
        { id: LESSON_2, sectionId: SECTION_A, order: 0 },
      ]);
    });

    it('runs every write inside one transaction when the server supports it', async () => {
      await service.reorder(COURSE_ID, fullPayload(), TUTOR);

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      for (const call of [
        ...sectionModel.bulkWrite.mock.calls,
        ...lessonModel.bulkWrite.mock.calls,
      ]) {
        expect(call[1]).toEqual(expect.objectContaining({ session }));
      }
      expect(session.endSession).toHaveBeenCalled();
    });

    it('falls back to sessionless writes on a standalone server', async () => {
      const unsupported = Object.assign(
        new Error(
          'Transaction numbers are only allowed on a replica set member or mongos',
        ),
        { codeName: 'IllegalOperation' },
      );
      session.withTransaction.mockRejectedValueOnce(unsupported);

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).resolves.toBeDefined();

      for (const call of sectionModel.bulkWrite.mock.calls) {
        expect(call[1]).not.toHaveProperty('session');
      }
    });

    it('restores the previous layout when a fallback write fails midway', async () => {
      session.withTransaction.mockRejectedValueOnce(
        Object.assign(new Error('transactions are not supported'), {
          codeName: 'IllegalOperation',
        }),
      );
      lessonModel.bulkWrite
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValue({ ok: 1 });

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).rejects.toThrow('write failed');

      // The rollback puts each lesson back under its original section.
      const restore = lessonModel.bulkWrite.mock.calls.at(-1)[0];
      expect(
        restore.map((op: any) => ({
          id: op.updateOne.filter._id.toHexString(),
          sectionId: op.updateOne.update.$set.sectionId.toHexString(),
          order: op.updateOne.update.$set.order,
        })),
      ).toEqual([
        { id: LESSON_1, sectionId: SECTION_A, order: 0 },
        { id: LESSON_2, sectionId: SECTION_A, order: 1 },
        { id: LESSON_3, sectionId: SECTION_B, order: 0 },
      ]);
    });

    it('surfaces a genuine error instead of retrying it without a session', async () => {
      session.withTransaction.mockRejectedValueOnce(new Error('disk full'));

      await expect(
        service.reorder(COURSE_ID, fullPayload(), TUTOR),
      ).rejects.toThrow('disk full');
      expect(connection.startSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('reads', () => {
    it('nests lessons under their section in stored order', async () => {
      const view = await service.getCurriculum(COURSE_ID, TUTOR);

      expect(view.curriculumVersion).toBe(3);
      expect(view.sections.map((s) => s.id)).toEqual([SECTION_A, SECTION_B]);
      expect(view.sections[0].lessons.map((l) => l.id)).toEqual([
        LESSON_1,
        LESSON_2,
      ]);
      expect(view.sections[1].lessons.map((l) => l.id)).toEqual([LESSON_3]);
    });
  });
});
