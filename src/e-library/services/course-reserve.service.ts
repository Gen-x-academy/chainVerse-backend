import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CourseReserve,
  CourseReserveDocument,
  ReserveStatus,
} from '../schemas/course-reserve.schema';
import { CreateCourseReserveDto } from '../dto/course-reserve.dto';
import {
  BusinessRuleException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/**
 * Manages course reserve records in the e-library.
 *
 * A reserve ties a physical copy or digital edition to a specific course for
 * a defined date window, applying a shortened loan period to ensure high item
 * turnover during the course term.
 *
 * Conflict rules:
 *  - Two ACTIVE reserves for the same `copyId` may not overlap in date range.
 *  - Two ACTIVE reserves for the same `editionId` + `courseId` combination may
 *    not overlap in date range.
 *
 * Lifecycle:
 *  - ACTIVE → CANCELLED (manual, via `cancel()`)
 *  - ACTIVE → EXPIRED  (automatic, via `expireStale()` scheduler)
 */
@Injectable()
export class CourseReserveService {
  private readonly logger = new Logger(CourseReserveService.name);

  constructor(
    @InjectModel(CourseReserve.name)
    private readonly reserveModel: Model<CourseReserveDocument>,
  ) {}

  /**
   * Create a new course reserve.
   *
   * Validates:
   *  - startDate must be strictly before endDate.
   *  - No conflicting ACTIVE reserve exists for the same copyId, or for the
   *    same editionId+courseId combination, with an overlapping date range.
   */
  async create(
    dto: CreateCourseReserveDto,
    requestedBy: string,
  ): Promise<CourseReserveDocument> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start >= end) {
      throw new ValidationDomainException(
        'startDate must be strictly before endDate',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    // Conflict detection: overlapping date ranges for the same resource
    await this.assertNoConflict(dto, start, end);

    const reserve = await this.reserveModel.create({
      courseId: dto.courseId,
      requestedBy,
      copyId: dto.copyId ? new Types.ObjectId(dto.copyId) : null,
      editionId: dto.editionId ?? null,
      startDate: start,
      endDate: end,
      specialLoanPeriodDays: dto.specialLoanPeriodDays,
      notes: dto.notes ?? null,
      status: ReserveStatus.ACTIVE,
    });

    this.logger.log(
      `Course reserve created: ${reserve._id} for course ${dto.courseId} by ${requestedBy}`,
    );

    return reserve;
  }

  /**
   * Return all ACTIVE reserves for a given course.
   */
  async findByCourse(courseId: string): Promise<CourseReserveDocument[]> {
    return this.reserveModel
      .find({ courseId, status: ReserveStatus.ACTIVE })
      .sort({ startDate: 1 })
      .exec();
  }

  /**
   * Return a single reserve by ID.
   *
   * @throws ResourceNotFoundException if the ID does not exist.
   */
  async findOne(id: string): Promise<CourseReserveDocument> {
    const reserve = await this.reserveModel.findById(id).exec();

    if (!reserve) {
      throw new ResourceNotFoundException(
        `Course reserve ${id} not found`,
        ErrorCode.RES_NOT_FOUND,
      );
    }

    return reserve;
  }

  /**
   * Cancel an ACTIVE reserve.
   *
   * @throws ResourceNotFoundException if not found.
   * @throws BusinessRuleException if the reserve is already EXPIRED or CANCELLED.
   */
  async cancel(id: string, requestedBy: string): Promise<CourseReserveDocument> {
    const reserve = await this.findOne(id);

    if (reserve.status !== ReserveStatus.ACTIVE) {
      throw new BusinessRuleException(
        `Course reserve ${id} cannot be cancelled: current status is '${reserve.status}'`,
        ErrorCode.BIZ_RESERVE_NOT_CANCELLABLE,
      );
    }

    reserve.status = ReserveStatus.CANCELLED;
    await reserve.save();

    this.logger.log(
      `Course reserve ${id} cancelled by ${requestedBy}`,
    );

    return reserve;
  }

  /**
   * Expire all ACTIVE reserves whose endDate is in the past.
   *
   * Intended to be called by a scheduled job (e.g., nightly).
   * Returns the number of records transitioned to EXPIRED.
   */
  async expireStale(): Promise<number> {
    const now = new Date();

    const result = await this.reserveModel.updateMany(
      { status: ReserveStatus.ACTIVE, endDate: { $lt: now } },
      { $set: { status: ReserveStatus.EXPIRED } },
    );

    const count = result.modifiedCount;

    if (count > 0) {
      this.logger.log(`Expired ${count} stale course reserve(s)`);
    }

    return count;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check for overlapping ACTIVE reserves for the same resource.
   *
   * Two date ranges [A.start, A.end] and [B.start, B.end] overlap when:
   *   A.start < B.end AND A.end > B.start
   */
  private async assertNoConflict(
    dto: CreateCourseReserveDto,
    start: Date,
    end: Date,
  ): Promise<void> {
    const overlapFilter = {
      status: ReserveStatus.ACTIVE,
      startDate: { $lt: end },
      endDate: { $gt: start },
    };

    // Physical copy conflict
    if (dto.copyId) {
      const copyConflict = await this.reserveModel
        .findOne({
          ...overlapFilter,
          copyId: new Types.ObjectId(dto.copyId),
        })
        .exec();

      if (copyConflict) {
        throw new BusinessRuleException(
          `An active reserve for copy ${dto.copyId} already overlaps the requested date range ` +
            `(${copyConflict.startDate.toISOString()} – ${copyConflict.endDate.toISOString()})`,
          ErrorCode.BIZ_RESERVE_CONFLICT,
        );
      }
    }

    // Digital edition + course conflict
    if (dto.editionId) {
      const editionConflict = await this.reserveModel
        .findOne({
          ...overlapFilter,
          editionId: dto.editionId,
          courseId: dto.courseId,
        })
        .exec();

      if (editionConflict) {
        throw new BusinessRuleException(
          `An active reserve for edition ${dto.editionId} on course ${dto.courseId} already overlaps the requested date range ` +
            `(${editionConflict.startDate.toISOString()} – ${editionConflict.endDate.toISOString()})`,
          ErrorCode.BIZ_RESERVE_CONFLICT,
        );
      }
    }
  }
}
