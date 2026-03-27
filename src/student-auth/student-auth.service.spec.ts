import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { StudentAuthService } from './student-auth.service';
import { Student, StudentDocument } from './schemas/student.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import * as bcrypt from 'bcryptjs';

describe('StudentAuthService', () => {
  let service: StudentAuthService;
  let studentModel: Model<StudentDocument>;
  let refreshTokenModel: Model<RefreshTokenDocument>;
  let eventEmitter: EventEmitter2;

  const mockStudent = {
    _id: new Types.ObjectId(),
    id: 'test-student-id',
    firstName: 'Test',
    lastName: 'Student',
    email: 'test@example.com',
    passwordHash: '',
    emailVerified: false,
    verificationToken: null,
    role: 'student',
    save: jest.fn(),
  };

  const mockRefreshToken = {
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentAuthService,
        {
          provide: getModelToken(Student.name),
          useValue: {
            findOne: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: {
            create: jest.fn(),
            deleteMany: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret-key'),
          },
        },
      ],
    }).compile();

    service = module.get<StudentAuthService>(StudentAuthService);
    studentModel = module.get<Model<StudentDocument>>(getModelToken(Student.name));
    refreshTokenModel = module.get<Model<RefreshTokenDocument>>(getModelToken(RefreshToken.name));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createStudentDto: CreateStudentDto = {
      firstName: 'Test',
      lastName: 'Student',
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should create a new student with hashed password', async () => {
      jest.spyOn(studentModel, 'findOne').mockResolvedValue(null as any);
      
      const mockCreatedStudent = {
        ...mockStudent,
        passwordHash: await bcrypt.hash('SecurePassword123!', 10),
        save: jest.fn().mockResolvedValue({ ...mockStudent, id: 'test-student-id' }),
      } as any;

      jest.spyOn(studentModel, 'create').mockResolvedValue(mockCreatedStudent as any);

      const result = await service.create(createStudentDto);

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.emailVerified).toBe(false);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Verify password is not in response
      expect((result as any).password).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw ConflictException for duplicate email', async () => {
      jest.spyOn(studentModel, 'findOne').mockResolvedValue(mockStudent as any);

      await expect(service.create(createStudentDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createStudentDto)).rejects.toThrow('Email already registered');
    });

    it('should throw BadRequestException for invalid email format', async () => {
      const invalidDto = { ...createStudentDto, email: 'invalid-email' };

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(invalidDto)).rejects.toThrow('Invalid email format');
    });

    it('should throw BadRequestException for short password', async () => {
      const invalidDto = { ...createStudentDto, password: 'short' };

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(invalidDto)).rejects.toThrow('Password must be at least 8 characters');
    });

    it('should throw BadRequestException for missing required fields', async () => {
      const invalidDto = { firstName: 'Test', lastName: 'Student' } as any;

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(invalidDto)).rejects.toThrow('firstName, lastName, email, and password are required');
    });

    it('should emit STUDENT_REGISTERED event', async () => {
      jest.spyOn(studentModel, 'findOne').mockResolvedValue(null as any);
      
      const mockCreatedStudent = {
        ...mockStudent,
        passwordHash: await bcrypt.hash('SecurePassword123!', 10),
        save: jest.fn().mockResolvedValue({ ...mockStudent, id: 'test-student-id' }),
      } as any;

      jest.spyOn(studentModel, 'create').mockResolvedValue(mockCreatedStudent as any);
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await service.create(createStudentDto);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          studentId: 'test-student-id',
          email: 'test@example.com',
          firstName: 'Test',
        }),
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginStudentDto = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
    };

    it('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10);
      const mockVerifiedStudent = {
        ...mockStudent,
        passwordHash: hashedPassword,
        emailVerified: true,
      } as any;

      jest.spyOn(studentModel, 'findOne').mockResolvedValue(mockVerifiedStudent);

      const result = await service.login(loginDto);

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.emailVerified).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Verify password is not in response
      expect((result as any).password).toBeUndefined();
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      jest.spyOn(studentModel, 'findOne').mockResolvedValue(null as any);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const wrongPasswordStudent = {
        ...mockStudent,
        passwordHash: await bcrypt.hash('WrongPassword123!', 10),
      } as any;

      jest.spyOn(studentModel, 'findOne').mockResolvedValue(wrongPasswordStudent);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for unverified email', async () => {
      const unverifiedStudent = {
        ...mockStudent,
        passwordHash: await bcrypt.hash('SecurePassword123!', 10),
        emailVerified: false,
      } as any;

      jest.spyOn(studentModel, 'findOne').mockResolvedValue(unverifiedStudent);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Please verify your email before logging in');
    });

    it('should throw BadRequestException for missing credentials', async () => {
      const invalidDto = { email: 'test@example.com' } as any;

      await expect(service.login(invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.login(invalidDto)).rejects.toThrow('Email and password are required');
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'valid-verification-token',
    };

    it('should verify email with valid token', async () => {
      const mockUnverifiedStudent = {
        ...mockStudent,
        verificationToken: 'valid-verification-token',
        emailVerified: false,
        save: jest.fn().mockResolvedValue({ ...mockStudent, emailVerified: true }),
      } as any;

      jest.spyOn(studentModel, 'findOne').mockResolvedValue(mockUnverifiedStudent);

      const result = await service.verifyEmail(verifyEmailDto);

      expect(result.message).toMatch(/verified/i);
      expect(mockUnverifiedStudent.emailVerified).toBe(true);
      expect(mockUnverifiedStudent.verificationToken).toBe(null);
    });

    it('should throw BadRequestException for missing token', async () => {
      const invalidDto = { token: '' } as any;

      await expect(service.verifyEmail(invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.verifyEmail(invalidDto)).rejects.toThrow('Verification token is required');
    });

    it('should throw NotFoundException for invalid token', async () => {
      jest.spyOn(studentModel, 'findOne').mockResolvedValue(null as any);

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow('Invalid verification token');
    });
  });

  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await (service as any).hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt hashes start with $2
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await (service as any).hashPassword(password);
      const hash2 = await (service as any).hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await (service as any).verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await (service as any).verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });
  });
});
