import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  AnyBulkWriteOperation,
  ClientSession,
  Connection,
  Model,
  Types,
} from 'mongoose';
import { Course, CourseDocument } from '../admin-course/schemas/course.schema';
import { Role } from '../common/enums/role.enum';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { ReorderCurriculumDto } from './dto/reorder-curriculum.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import {
  CourseSection,
  CourseSectionDocument,
} from './schemas/course-section.schema';
import { Lesson, LessonDocument } from './schemas/lesson.schema';

/** Identity a curriculum call acts under, taken from the verified JWT. */
export interface CurriculumActor {
  id: string;
  role: string;
}

/**
 * Positions used while a reorder is in flight. Every document is parked above
 * this offset in phase one so the unique (parent, order) indexes cannot fire
 * while phase two writes the final, compact positions.
 */
const REORDER_STAGING_OFFSET = 1_000_000;

const PRIVILEGED_ROLES: ReadonlySet<string> = new Set([
  Role.ADMIN,
  Role.MODERATOR,
]);

export interface CurriculumView {
  courseId: string;
  curriculumVersion: number;
  sections: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessons: Array<Record<string, unknown>>;
  }>;
}

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  /**
   * Cached probe result: `undefined` until the first transactional write tells
   * us whether the deployment is a replica set (transactions) or a standalone
   * server (staged writes with best-effort rollback).
   */
  private transactionsSupported: boolean | undefined;

  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSectionDocument>,
    @InjectModel(Lesson.name)
    private readonly lessonModel: Model<LessonDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async getCurriculum(
    courseId: string,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    return this.buildView(course);
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  async addSection(
    courseId: string,
    dto: CreateSectionDto,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const courseObjectId = new Types.ObjectId(course.id);

    return this.withCurriculumTransaction(async (session) => {
      const last = await this.sectionModel
        .findOne({ courseId: courseObjectId })
        .sort({ order: -1 })
        .session(session)
        .exec();

      await this.sectionModel.create(
        [
          {
            courseId: courseObjectId,
            title: dto.title,
            description: dto.description ?? null,
            order: last ? last.order + 1 : 0,
          },
        ],
        session ? { session } : {},
      );

      await this.bumpCurriculumVersion(course.id, session);
      return this.buildView(await this.reloadCourse(course.id));
    });
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    dto: UpdateSectionDto,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const section = await this.sectionModel
      .findOne({
        _id: new Types.ObjectId(sectionId),
        courseId: new Types.ObjectId(course.id),
      })
      .exec();

    if (!section) {
      throw new NotFoundException(`Section ${sectionId} not found`);
    }

    if (dto.title !== undefined) section.title = dto.title;
    if (dto.description !== undefined) {
      section.description = dto.description ?? null;
    }
    await section.save();

    await this.bumpCurriculumVersion(course.id, null);
    return this.buildView(await this.reloadCourse(course.id));
  }

  /** Removes a section together with its lessons and closes the position gap. */
  async removeSection(
    courseId: string,
    sectionId: string,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const courseObjectId = new Types.ObjectId(course.id);
    const sectionObjectId = new Types.ObjectId(sectionId);

    const section = await this.sectionModel
      .findOne({ _id: sectionObjectId, courseId: courseObjectId })
      .exec();
    if (!section) {
      throw new NotFoundException(`Section ${sectionId} not found`);
    }

    return this.withCurriculumTransaction(async (session) => {
      await this.lessonModel
        .deleteMany({ sectionId: sectionObjectId })
        .session(session)
        .exec();
      await this.sectionModel
        .deleteOne({ _id: sectionObjectId })
        .session(session)
        .exec();

      const remaining = await this.sectionModel
        .find({ courseId: courseObjectId })
        .sort({ order: 1 })
        .session(session)
        .exec();
      await this.compactOrders(
        this.sectionModel,
        remaining.map((doc) => doc.id),
        session,
      );

      await this.bumpCurriculumVersion(course.id, session);
      return this.buildView(await this.reloadCourse(course.id));
    });
  }

  // ---------------------------------------------------------------------------
  // Lessons
  // ---------------------------------------------------------------------------

  async addLesson(
    courseId: string,
    sectionId: string,
    dto: CreateLessonDto,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const courseObjectId = new Types.ObjectId(course.id);
    const sectionObjectId = new Types.ObjectId(sectionId);

    const section = await this.sectionModel
      .findOne({ _id: sectionObjectId, courseId: courseObjectId })
      .exec();
    if (!section) {
      throw new NotFoundException(`Section ${sectionId} not found`);
    }

    return this.withCurriculumTransaction(async (session) => {
      const last = await this.lessonModel
        .findOne({ sectionId: sectionObjectId })
        .sort({ order: -1 })
        .session(session)
        .exec();

      await this.lessonModel.create(
        [
          {
            courseId: courseObjectId,
            sectionId: sectionObjectId,
            title: dto.title,
            description: dto.description ?? null,
            order: last ? last.order + 1 : 0,
            contentUnits: this.normalizeContentUnits(dto.contentUnits),
            durationMinutes: dto.durationMinutes ?? 0,
            isPreview: dto.isPreview ?? false,
            status: dto.status ?? 'draft',
          },
        ],
        session ? { session } : {},
      );

      await this.bumpCurriculumVersion(course.id, session);
      return this.buildView(await this.reloadCourse(course.id));
    });
  }

  async updateLesson(
    courseId: string,
    lessonId: string,
    dto: UpdateLessonDto,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const lesson = await this.lessonModel
      .findOne({
        _id: new Types.ObjectId(lessonId),
        courseId: new Types.ObjectId(course.id),
      })
      .exec();

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (dto.title !== undefined) lesson.title = dto.title;
    if (dto.description !== undefined) {
      lesson.description = dto.description ?? null;
    }
    if (dto.contentUnits !== undefined) {
      lesson.contentUnits = this.normalizeContentUnits(dto.contentUnits);
    }
    if (dto.durationMinutes !== undefined) {
      lesson.durationMinutes = dto.durationMinutes;
    }
    if (dto.isPreview !== undefined) lesson.isPreview = dto.isPreview;
    if (dto.status !== undefined) lesson.status = dto.status;
    await lesson.save();

    await this.bumpCurriculumVersion(course.id, null);
    return this.buildView(await this.reloadCourse(course.id));
  }

  async removeLesson(
    courseId: string,
    lessonId: string,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const lesson = await this.lessonModel
      .findOne({
        _id: new Types.ObjectId(lessonId),
        courseId: new Types.ObjectId(course.id),
      })
      .exec();

    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    const sectionObjectId = lesson.sectionId;

    return this.withCurriculumTransaction(async (session) => {
      await this.lessonModel
        .deleteOne({ _id: lesson._id })
        .session(session)
        .exec();

      const remaining = await this.lessonModel
        .find({ sectionId: sectionObjectId })
        .sort({ order: 1 })
        .session(session)
        .exec();
      await this.compactOrders(
        this.lessonModel,
        remaining.map((doc) => doc.id),
        session,
      );

      await this.bumpCurriculumVersion(course.id, session);
      return this.buildView(await this.reloadCourse(course.id));
    });
  }

  // ---------------------------------------------------------------------------
  // Reordering
  // ---------------------------------------------------------------------------

  /**
   * Reorders every section and lesson of a course in one operation.
   *
   * The payload must describe the whole outline: a partial list is rejected
   * rather than merged, which is what makes the result independent of the order
   * requests happen to arrive in. `expectedVersion` is claimed with a
   * conditional update before anything moves, so a client working from a stale
   * outline loses the race with 409 instead of overwriting a newer layout.
   */
  async reorder(
    courseId: string,
    dto: ReorderCurriculumDto,
    actor: CurriculumActor,
  ): Promise<CurriculumView> {
    const course = await this.loadAuthorizedCourse(courseId, actor);
    const courseObjectId = new Types.ObjectId(course.id);

    const [sections, lessons] = await Promise.all([
      this.sectionModel.find({ courseId: courseObjectId }).exec(),
      this.lessonModel.find({ courseId: courseObjectId }).exec(),
    ]);

    this.assertCoversOutline(dto, sections, lessons);

    return this.withCurriculumTransaction(async (session) => {
      // Claim the version first: whoever loses this conditional update has been
      // working from an outline that no longer exists and must reload.
      const claimed = await this.courseModel
        .findOneAndUpdate(
          {
            _id: courseObjectId,
            ...this.versionMatch(dto.expectedVersion),
          },
          { $inc: { curriculumVersion: 1 } },
          { returnDocument: 'after', session },
        )
        .exec();

      if (!claimed) {
        throw new ConflictException(
          `Curriculum for course ${courseId} has changed since version ${dto.expectedVersion}; reload the curriculum and retry`,
        );
      }

      const previousPositions = {
        sections: sections.map((doc) => ({
          id: doc.id,
          order: doc.order,
        })),
        lessons: lessons.map((doc) => ({
          id: doc.id,
          sectionId: doc.sectionId,
          order: doc.order,
        })),
      };

      try {
        await this.applyReorder(dto, session);
      } catch (error) {
        // Inside a transaction the abort undoes the staged writes for us.
        // On a standalone server there is nothing to abort, so put the
        // documents back where they were before rethrowing.
        if (!session) {
          await this.restorePositions(previousPositions);
        }
        throw error;
      }

      return this.buildView(await this.reloadCourse(course.id));
    });
  }

  /** Phase one parks every document above the staging offset, phase two lands them. */
  private async applyReorder(
    dto: ReorderCurriculumDto,
    session: ClientSession | null,
  ): Promise<void> {
    const sectionStaging: AnyBulkWriteOperation[] = [];
    const sectionFinal: AnyBulkWriteOperation[] = [];
    const lessonStaging: AnyBulkWriteOperation[] = [];
    const lessonFinal: AnyBulkWriteOperation[] = [];

    let lessonCounter = 0;

    dto.sections.forEach((sectionEntry, sectionIndex) => {
      const sectionObjectId = new Types.ObjectId(sectionEntry.sectionId);

      sectionStaging.push({
        updateOne: {
          filter: { _id: sectionObjectId },
          update: { $set: { order: REORDER_STAGING_OFFSET + sectionIndex } },
        },
      });
      sectionFinal.push({
        updateOne: {
          filter: { _id: sectionObjectId },
          update: { $set: { order: sectionIndex } },
        },
      });

      sectionEntry.lessonIds.forEach((lessonId, lessonIndex) => {
        const lessonObjectId = new Types.ObjectId(lessonId);

        lessonStaging.push({
          updateOne: {
            filter: { _id: lessonObjectId },
            update: {
              $set: { order: REORDER_STAGING_OFFSET + lessonCounter++ },
            },
          },
        });
        lessonFinal.push({
          updateOne: {
            filter: { _id: lessonObjectId },
            update: {
              $set: { sectionId: sectionObjectId, order: lessonIndex },
            },
          },
        });
      });
    });

    const options = session ? { session, ordered: true } : { ordered: true };

    await this.sectionModel.bulkWrite(sectionStaging, options);
    await this.lessonModel.bulkWrite(lessonStaging, options);
    await this.sectionModel.bulkWrite(sectionFinal, options);
    await this.lessonModel.bulkWrite(lessonFinal, options);
  }

  /**
   * Rejects any payload that is not a permutation of the stored outline.
   * Silently merging a partial list is what lets two concurrent editors drop or
   * duplicate a lesson, so an incomplete request is an error, not a hint.
   */
  private assertCoversOutline(
    dto: ReorderCurriculumDto,
    sections: CourseSectionDocument[],
    lessons: LessonDocument[],
  ): void {
    const payloadSectionIds = dto.sections.map((entry) => entry.sectionId);
    const payloadLessonIds = dto.sections.flatMap((entry) => entry.lessonIds);

    this.assertPermutation(
      payloadSectionIds,
      sections.map((doc) => doc.id),
      'section',
    );
    this.assertPermutation(
      payloadLessonIds,
      lessons.map((doc) => doc.id),
      'lesson',
    );
  }

  private assertPermutation(
    submitted: string[],
    persisted: string[],
    label: string,
  ): void {
    const seen = new Set<string>();
    for (const id of submitted) {
      if (seen.has(id)) {
        throw new BadRequestException(
          `Duplicate ${label} id in payload: ${id}`,
        );
      }
      seen.add(id);
    }

    const known = new Set(persisted);
    const unknown = submitted.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown ${label} id for this course: ${unknown.join(', ')}`,
      );
    }

    const missing = persisted.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Reorder payload must list every ${label} of the course; missing: ${missing.join(', ')}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Runs `work` inside a transaction when the deployment supports one, and
   * falls back to a direct run on a standalone server (single-node development
   * and test databases) instead of failing the request.
   */
  private async withCurriculumTransaction<T>(
    work: (session: ClientSession | null) => Promise<T>,
  ): Promise<T> {
    if (this.transactionsSupported === false) {
      return work(null);
    }

    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      this.transactionsSupported = true;
      return result as T;
    } catch (error) {
      if (!this.isUnsupportedTransactionError(error)) {
        throw error;
      }
      this.transactionsSupported = false;
      this.logger.warn(
        'MongoDB deployment does not support transactions; curriculum writes fall back to staged updates guarded by curriculumVersion',
      );
      return work(null);
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  private isUnsupportedTransactionError(error: unknown): boolean {
    if (this.transactionsSupported === true) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    const codeName = (error as { codeName?: string } | null)?.codeName;
    return (
      codeName === 'IllegalOperation' ||
      /transaction numbers are only allowed on a replica set/i.test(message) ||
      /transactions are not supported/i.test(message) ||
      /this MongoDB deployment does not support retryable writes/i.test(message)
    );
  }

  /**
   * Matches the stored version, treating a course written before
   * `curriculumVersion` existed as version 0 rather than as a stale request.
   */
  private versionMatch(expectedVersion: number): Record<string, unknown> {
    if (expectedVersion !== 0) {
      return { curriculumVersion: expectedVersion };
    }
    return {
      $or: [
        { curriculumVersion: 0 },
        { curriculumVersion: { $exists: false } },
      ],
    };
  }

  private async bumpCurriculumVersion(
    courseId: string,
    session: ClientSession | null,
  ): Promise<void> {
    const query = this.courseModel.updateOne(
      { _id: new Types.ObjectId(courseId) },
      { $inc: { curriculumVersion: 1 } },
    );
    if (session) {
      query.session(session);
    }
    await query.exec();
  }

  private async compactOrders(
    model: Model<CourseSectionDocument> | Model<LessonDocument>,
    orderedIds: string[],
    session: ClientSession | null,
  ): Promise<void> {
    if (orderedIds.length === 0) {
      return;
    }

    const staging: AnyBulkWriteOperation[] = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id) },
        update: { $set: { order: REORDER_STAGING_OFFSET + index } },
      },
    }));
    const final: AnyBulkWriteOperation[] = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id) },
        update: { $set: { order: index } },
      },
    }));

    const options = session ? { session, ordered: true } : { ordered: true };
    await (model as Model<CourseSectionDocument>).bulkWrite(staging, options);
    await (model as Model<CourseSectionDocument>).bulkWrite(final, options);
  }

  private async restorePositions(previous: {
    sections: Array<{ id: string; order: number }>;
    lessons: Array<{ id: string; sectionId: Types.ObjectId; order: number }>;
  }): Promise<void> {
    try {
      await this.compactOrders(
        this.sectionModel,
        [...previous.sections]
          .sort((a, b) => a.order - b.order)
          .map((entry) => entry.id),
        null,
      );

      const lessonStaging: AnyBulkWriteOperation[] = previous.lessons.map(
        (entry, index) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(entry.id) },
            update: { $set: { order: REORDER_STAGING_OFFSET + index } },
          },
        }),
      );
      const lessonFinal: AnyBulkWriteOperation[] = previous.lessons.map(
        (entry) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(entry.id) },
            update: {
              $set: { sectionId: entry.sectionId, order: entry.order },
            },
          },
        }),
      );

      await this.lessonModel.bulkWrite(lessonStaging, { ordered: true });
      await this.lessonModel.bulkWrite(lessonFinal, { ordered: true });
    } catch (rollbackError) {
      this.logger.error(
        `Failed to roll back a partial curriculum reorder: ${
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError)
        }`,
      );
    }
  }

  private normalizeContentUnits(
    units: CreateLessonDto['contentUnits'],
  ): Lesson['contentUnits'] {
    if (!units) {
      return [];
    }

    return [...units]
      .sort((a, b) => a.order - b.order)
      .map((unit, index) => ({
        type: unit.type,
        title: unit.title,
        order: index,
        url: unit.url ?? null,
        body: unit.body ?? null,
        durationMinutes: unit.durationMinutes ?? 0,
      }));
  }

  private async loadAuthorizedCourse(
    courseId: string,
    actor: CurriculumActor,
  ): Promise<CourseDocument> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course || course.deletedAt) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    if (!PRIVILEGED_ROLES.has(actor.role) && course.tutorId !== actor.id) {
      throw new ForbiddenException(
        'You can only manage the curriculum of your own courses',
      );
    }

    return course;
  }

  private async reloadCourse(courseId: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }
    return course;
  }

  private async buildView(course: CourseDocument): Promise<CurriculumView> {
    const courseObjectId = new Types.ObjectId(course.id);
    const [sections, lessons] = await Promise.all([
      this.sectionModel
        .find({ courseId: courseObjectId })
        .sort({ order: 1 })
        .exec(),
      this.lessonModel
        .find({ courseId: courseObjectId })
        .sort({ order: 1 })
        .exec(),
    ]);

    const lessonsBySection = new Map<string, LessonDocument[]>();
    for (const lesson of lessons) {
      const key = lesson.sectionId.toString();
      const bucket = lessonsBySection.get(key);
      if (bucket) {
        bucket.push(lesson);
      } else {
        lessonsBySection.set(key, [lesson]);
      }
    }

    return {
      courseId: course.id,
      curriculumVersion: course.curriculumVersion ?? 0,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description ?? null,
        order: section.order,
        lessons: (lessonsBySection.get(section.id) ?? [])
          .sort((a, b) => a.order - b.order)
          .map((lesson) => ({
            id: lesson.id,
            sectionId: lesson.sectionId.toString(),
            title: lesson.title,
            description: lesson.description ?? null,
            order: lesson.order,
            contentUnits: lesson.contentUnits,
            durationMinutes: lesson.durationMinutes,
            isPreview: lesson.isPreview,
            status: lesson.status,
          })),
      })),
    };
  }
}
