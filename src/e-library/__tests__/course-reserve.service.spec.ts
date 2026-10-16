import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CourseReserveService } from '../services/course-reserve.service';
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

describe('CourseReserveService', () => {
  let service: CourseReserveService;
  let reserveModel: jest.Mocked<Model<CourseReserveDocument>>;

  const LIBRARIAN_ID = 'librarian-001';
  const RESERVE_ID = '507f1f77bcf86cd799439099';
  const COPY_ID = '507f1f77bcf86cd799439011';
  const EDITION_ID = 'EDITION-ISBN-9780451524935';
  const COURSE_ID = 'COURSE-CS101-2026';

  const futureStart = '2026-02-01';
  const futureEnd = '2026-05-31';

  const baseDto: CreateCourseReserveDto = {
    courseId: COURSE_ID,
    copyId: COPY_ID,
    editionId: EDITION_ID,
    startDate: futureStart,
    endDate: futureEnd,
    specialLoanPeriodDays: 3,
    notes: 'Required reading CS101',
  };

  const mockActiveReserve = {
    _id: RESERVE_ID,
    courseId: COURSE_ID,
    requestedBy: LIBRARIAN_ID,
    copyId: COPY_ID,
    editionId: EDITION_ID,
    startDate: new Date(futureStart),
    endDate: new Date(futureEnd),
    specialLoanPeriodDays: 3,
    notes: 'Required reading CS101',
    status: ReserveStatus.ACTIVE,
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as CourseReserveDocument;

  beforeEach(async () => {
    reserveModel = {
      create: jest.fn().mockResolvedValue(mockActiveReserve),
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseReserveService,
        {
          provide: getModelToken(CourseReserve.name),
          useValue: reserveModel,
        },
      ],
    }).compile();

    service = module.get<CourseReserveService>(CourseReserveService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new reserve when no conflicts exist', async () => {
      // No conflicts: findOne returns null (already mocked)
      const result = await service.create(baseDto, LIBRARIAN_ID);

      expect(reserveModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: COURSE_ID,
          requestedBy: LIBRARIAN_ID,
          specialLoanPeriodDays: 3,
          status: ReserveStatus.ACTIVE,
        }),
      );
      expect(result).toBe(mockActiveReserve);
    });

    it('should throw ValidationDomainException when startDate >= endDate', async () => {
      const badDto: CreateCourseReserveDto = {
        ...baseDto,
        startDate: '2026-06-01',
        endDate: '2026-05-01', // end before start
      };

      await expect(service.create(badDto, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        ValidationDomainException,
      );

      expect(reserveModel.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationDomainException when startDate equals endDate', async () => {
      const equalDto: CreateCourseReserveDto = {
        ...baseDto,
        startDate: '2026-03-01',
        endDate: '2026-03-01',
      };

      await expect(service.create(equalDto, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        ValidationDomainException,
      );
    });

    it('should throw BusinessRuleException (BIZ_RESERVE_CONFLICT) when a copy conflict exists', async () => {
      // findOne returns an existing reserve for the copy → conflict
      reserveModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockActiveReserve,
          _id: 'existing-reserve-id',
        }),
      });

      await expect(service.create(baseDto, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );

      expect(reserveModel.create).not.toHaveBeenCalled();
    });

    it('should throw BusinessRuleException when an edition+course conflict exists', async () => {
      const editionOnlyDto: CreateCourseReserveDto = {
        ...baseDto,
        copyId: undefined, // No physical copy — only digital
      };

      reserveModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockActiveReserve,
          _id: 'existing-edition-reserve',
        }),
      });

      await expect(service.create(editionOnlyDto, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });
  });

  // ── findByCourse ─────────────────────────────────────────────────────────────

  describe('findByCourse', () => {
    it('should return only ACTIVE reserves for the given course', async () => {
      const activeReserves = [mockActiveReserve];
      reserveModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(activeReserves),
        }),
      });

      const result = await service.findByCourse(COURSE_ID);

      expect(reserveModel.find).toHaveBeenCalledWith({
        courseId: COURSE_ID,
        status: ReserveStatus.ACTIVE,
      });
      expect(result).toEqual(activeReserves);
    });

    it('should return an empty array when no active reserves exist for the course', async () => {
      // Default mock already returns empty array
      const result = await service.findByCourse('COURSE-UNKNOWN');

      expect(result).toEqual([]);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return the reserve when it exists', async () => {
      reserveModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockActiveReserve),
      });

      const result = await service.findOne(RESERVE_ID);

      expect(reserveModel.findById).toHaveBeenCalledWith(RESERVE_ID);
      expect(result).toBe(mockActiveReserve);
    });

    it('should throw ResourceNotFoundException when the reserve does not exist', async () => {
      // Default mock returns null
      await expect(service.findOne('nonexistent-id')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should set status to CANCELLED for an ACTIVE reserve', async () => {
      const saveable = {
        ...mockActiveReserve,
        status: ReserveStatus.ACTIVE,
        save: jest.fn().mockResolvedValue(undefined),
      } as unknown as CourseReserveDocument;

      reserveModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(saveable),
      });

      const result = await service.cancel(RESERVE_ID, LIBRARIAN_ID);

      expect(saveable.save).toHaveBeenCalled();
      expect(result.status).toBe(ReserveStatus.CANCELLED);
    });

    it('should throw BusinessRuleException when the reserve is already CANCELLED', async () => {
      const cancelledReserve = {
        ...mockActiveReserve,
        status: ReserveStatus.CANCELLED,
        save: jest.fn(),
      } as unknown as CourseReserveDocument;

      reserveModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cancelledReserve),
      });

      await expect(service.cancel(RESERVE_ID, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );

      expect(cancelledReserve.save).not.toHaveBeenCalled();
    });

    it('should throw BusinessRuleException when the reserve is already EXPIRED', async () => {
      const expiredReserve = {
        ...mockActiveReserve,
        status: ReserveStatus.EXPIRED,
        save: jest.fn(),
      } as unknown as CourseReserveDocument;

      reserveModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(expiredReserve),
      });

      await expect(service.cancel(RESERVE_ID, LIBRARIAN_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });
  });

  // ── expireStale ───────────────────────────────────────────────────────────────

  describe('expireStale', () => {
    it('should expire stale ACTIVE reserves and return the count', async () => {
      reserveModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 5 });

      const count = await service.expireStale();

      expect(reserveModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ReserveStatus.ACTIVE,
          endDate: expect.objectContaining({ $lt: expect.any(Date) }),
        }),
        { $set: { status: ReserveStatus.EXPIRED } },
      );
      expect(count).toBe(5);
    });

    it('should return 0 when no stale reserves exist', async () => {
      // Default mock returns modifiedCount: 0
      const count = await service.expireStale();

      expect(count).toBe(0);
    });
  });
});
