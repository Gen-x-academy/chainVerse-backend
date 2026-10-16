import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { StudentEnrollmentService } from './student-enrollment.service';
import { Enrollment } from './schemas/enrollment.schema';
import { Course } from '../admin-course/schemas/course.schema';
import { CartItem } from '../student-cart/schemas/cart-item.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StellarService } from '../stellar/stellar.service';

describe('StudentEnrollmentService', () => {
  let service: StudentEnrollmentService;
  let enrollmentModel: any;
  let courseModel: any;
  let cartItemModel: any;
  let stellarService: any;
  let mockStellarService: any;

  const mockEnrollmentModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCourseModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockCartItemModel = {
    find: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  beforeEach(async () => {
    process.env.PLATFORM_STELLAR_ADDRESS = 'GABCDTESTPLATFORMADDRESS1234567890';

    mockStellarService = {
      verifyPayment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentService,
        {
          provide: getModelToken(Enrollment.name),
          useValue: mockEnrollmentModel,
        },
        {
          provide: getModelToken(Course.name),
          useValue: mockCourseModel,
        },
        {
          provide: getModelToken(CartItem.name),
          useValue: mockCartItemModel,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
      ],
    }).compile();

    service = module.get<StudentEnrollmentService>(StudentEnrollmentService);
    enrollmentModel = module.get(getModelToken(Enrollment.name));
    courseModel = module.get(getModelToken(Course.name));
    cartItemModel = module.get(getModelToken(CartItem.name));
    stellarService = module.get(StellarService);

    function HybridEnrollmentModel(dto?: any) {
      if (dto) {
        Object.assign(this, dto);
        this.save = jest.fn().mockResolvedValue(this);
      }
      return this;
    }
    HybridEnrollmentModel.findOne = jest.fn();
    HybridEnrollmentModel.find = jest.fn();
    HybridEnrollmentModel.create = jest.fn();
    HybridEnrollmentModel.findById = jest.fn();
    HybridEnrollmentModel.prototype.save = jest.fn().mockResolvedValue({});
    service.enrollmentModel = HybridEnrollmentModel;
    enrollmentModel = HybridEnrollmentModel;
  });

  describe('enrollFree', () => {
    it('should enroll a student in a free course', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 0, status: 'published' };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const mockSavedEnrollment = { studentId, courseId, type: 'free' };
      function MockEnrollment(dto: any) {
        Object.assign(this, dto);
        this.save = jest.fn().mockResolvedValue(mockSavedEnrollment);
      }
      (service as any).enrollmentModel = MockEnrollment;
      Object.assign(MockEnrollment, enrollmentModel);

      courseModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });

      const result = await service.enrollFree(studentId, courseId);
      expect(result).toEqual(mockSavedEnrollment);
      expect(courseModel.findByIdAndUpdate).toHaveBeenCalledWith(courseId, {
        $inc: { totalEnrollments: 1 },
      });
    });

    it('should throw BadRequestException if course is not free', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 100, status: 'published' };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });

      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if already enrolled', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 0, status: 'published' };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'enrollment1' }),
      });

      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if course does not exist', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if course is not published', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 0, status: 'draft' };
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkoutCart', () => {
    it('should throw BadRequestException if cart is empty', async () => {
      const studentId = 'student1';
      cartItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      await expect(service.checkoutCart(studentId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip already enrolled courses', async () => {
      const studentId = 'student1';
      const courseId = '507f1f77bcf86cd799439011';
      const cartItems = [{ _id: 'cart1', courseId }];
      cartItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cartItems),
      });
      const mockCourse = { _id: courseId, price: 0, status: 'published' };
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockCourse]),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'enrollment1' }),
      });
      cartItemModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      const result = await service.checkoutCart(studentId);
      expect(result.enrolled).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should skip unpublished courses', async () => {
      const studentId = 'student1';
      const courseId = '507f1f77bcf86cd799439011';
      const cartItems = [{ _id: 'cart1', courseId }];
      cartItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cartItems),
      });
      const mockCourse = { _id: courseId, price: 0, status: 'draft' };
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockCourse]),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      cartItemModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      const result = await service.checkoutCart(studentId);
      expect(result.enrolled).toEqual([]);
      expect(result.failed).toEqual([courseId]);
    });

    it('should throw NotImplementedException for paid courses', async () => {
      const studentId = 'student1';
      const courseId = '507f1f77bcf86cd799439011';
      const cartItems = [{ _id: 'cart1', courseId }];
      cartItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cartItems),
      });
      const mockCourse = { _id: courseId, price: 100, status: 'published' };
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockCourse]),
      });

      await expect(service.checkoutCart(studentId)).rejects.toThrow(
        NotImplementedException,
      );
      expect(mockStellarService.verifyPayment).not.toHaveBeenCalled();
    });

    it('should enroll free courses in cart using courseMap', async () => {
    it('should enroll free courses in cart', async () => {
      const studentId = 'student1';
      const courseId = '507f1f77bcf86cd799439011';
      const cartItems = [{ _id: 'cart1', courseId }];
      cartItemModel.find.mockReset();
      courseModel.find.mockReset();
      courseModel.findById.mockReset();
      enrollmentModel.findOne.mockReset();
      courseModel.findByIdAndUpdate.mockReset();
      cartItemModel.findByIdAndDelete.mockReset();

      cartItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cartItems),
      });
      const mockCourse = {
        _id: courseId,
        price: 0,
        status: 'published',
        tutorId: 'tutor1',
        tutorEmail: 'tutor@email.com',
      };
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockCourse]),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      service.enrollmentModel.prototype.save = jest.fn().mockResolvedValue({
        studentId,
        courseId,
        type: 'free',
        amountPaid: 0,
        status: 'completed',
      });
      enrollmentModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(null),
      }));
      courseModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      cartItemModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      const result = await service.checkoutCart(studentId);
      expect(result.enrolled).toEqual([courseId]);
      expect(result.failed).toEqual([]);
      expect(result.totalAmount).toBe(0);
    });
  });

  describe('isEnrolled', () => {
    it('returns true when enrollment record exists', async () => {
      enrollmentModel.findOne.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ studentId: 'student1', courseId: 'course1' }),
      });

      const result = await service.isEnrolled('student1', 'course1');
      expect(result).toBe(true);
      expect(enrollmentModel.findOne).toHaveBeenCalledWith({
        studentId: 'student1',
        courseId: 'course1',
      });
    });

    it('returns false when no enrollment record exists', async () => {
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.isEnrolled('student1', 'course1');
      expect(result).toBe(false);
    });
  });

  describe('getMyCourses', () => {
    it('should return empty array if no enrollments', async () => {
      const studentId = 'student1';
      enrollmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      const result = await service.getMyCourses(studentId);
      expect(result).toEqual([]);
    });

    it('should return enrollment and course pairs', async () => {
      const studentId = 'student1';
      const enrollments = [{ studentId, courseId: 'course1' }];
      const courses = [
        {
          id: 'course1',
          title: 'Course 1',
          description: 'desc',
          thumbnailUrl: null,
          tutorName: 'Tutor',
        },
      ];
      enrollmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(enrollments),
      });
      if (!courseModel.find) courseModel.find = jest.fn();
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(courses),
      });
      enrollments[0].courseId = 'course1';
      const result = await service.getMyCourses(studentId);
      expect(result).toEqual([
        {
          enrollment: enrollments[0],
          course: {
            id: 'course1',
            title: 'Course 1',
            description: 'desc',
            thumbnailUrl: null,
            tutorName: 'Tutor',
            progress: 0,
          },
        },
      ]);
    });
  });
});
