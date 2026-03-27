import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudentEnrollmentService } from './student-enrollment.service';
import { Enrollment } from './schemas/enrollment.schema';
import { Course } from '../admin-course/schemas/course.schema';
import { CartItem } from '../student-cart/schemas/cart-item.schema';

describe('StudentEnrollmentService', () => {
  let service: StudentEnrollmentService;
  let enrollmentModel: any;
  let courseModel: any;
  let cartItemModel: any;

  const mockEnrollmentModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCourseModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockCartItemModel = {
    find: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<StudentEnrollmentService>(StudentEnrollmentService);
    enrollmentModel = module.get(getModelToken(Enrollment.name));
    courseModel = module.get(getModelToken(Course.name));
    cartItemModel = module.get(getModelToken(CartItem.name));
  });

  describe('enrollFree', () => {
    it('should enroll a student in a free course', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 0 };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Mock the Enrollment instance and its save method
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

      // Re-initialize service with the mock constructor
      const result = await service.enrollFree(studentId, courseId);
      expect(result).toEqual(mockSavedEnrollment);
      expect(courseModel.findByIdAndUpdate).toHaveBeenCalledWith(courseId, {
        $addToSet: { enrolledStudents: studentId },
      });
    });

    it('should throw BadRequestException if course is not free', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 100 };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });

      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if already enrolled', async () => {
      const studentId = 'student1';
      const courseId = 'course1';
      const mockCourse = { _id: courseId, price: 0 };

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCourse),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'enrollment1' }),
      });

      await expect(service.enrollFree(studentId, courseId)).rejects.toThrow(ConflictException);
    });
  });
});
