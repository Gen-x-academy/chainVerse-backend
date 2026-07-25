import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { StudentAuthService } from './student-auth.service';
import { EmailService } from '../email/email.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Student, StudentDocument } from './schemas/student.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';
import { DomainEvents } from '../events/event-names';
import { StudentRegisteredPayload } from '../events/payloads/student-registered.payload';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';

jest.mock('bcryptjs');
jest.mock('crypto');

describe('StudentAuthService', () => {
  let service: StudentAuthService;
  let studentModel: Model<StudentDocument>;
  let refreshTokenModel: Model<RefreshTokenDocument>;
  let passwordResetTokenModel: Model<PasswordResetTokenDocument>;
  let jwtService: JwtService;
  let emailService: EmailService;
  let eventEmitter: EventEmitter2;

  // Helper to create a mock query with exec()
  const mockQuery = (returnValue: any) => ({
    exec: jest.fn().mockResolvedValue(returnValue),
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  });

  const mockStudent = {
    id: '507f1f77bcf86cd799439011',
    _id: '507f1f77bcf86cd799439011',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    passwordHash: 'hashedPassword123',
    emailVerified: false,
    role: 'student',
    verificationToken: null,
    verificationTokenExpiry: null,
    verificationAttempts: 0,
    lastVerificationAttempt: null,
    resetToken: null,
    resetTokenExpiry: null,
    createdAt: new Date(),
    save: jest.fn().mockResolvedValue(true),
  };

  const mockRefreshToken = {
    tokenHash: 'hashedToken',
    tokenFamily: 'family-123',
    studentId: '507f1f77bcf86cd799439011',
    expiresAt: new Date(Date.now() + 604800000),
    save: jest.fn().mockResolvedValue(true),
  };

  const mockPasswordResetToken = {
    tokenHash: 'hashedResetToken',
    studentId: '507f1f77bcf86cd799439011',
    expiresAt: new Date(Date.now() + 900000),
    used: false,
    usedAt: null,
    ipAddress: null,
    userAgent: null,
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentAuthService,
        {
          provide: getModelToken(Student.name),
          useValue: {
            findById: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: {
            findOne: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getModelToken(PasswordResetToken.name),
          useValue: {
            findOne: jest.fn(),
            updateMany: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendPasswordReset: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StudentAuthService>(StudentAuthService);
    studentModel = module.get<Model<StudentDocument>>(
      getModelToken(Student.name),
    );
    refreshTokenModel = module.get<Model<RefreshTokenDocument>>(
      getModelToken(RefreshToken.name),
    );
    passwordResetTokenModel = module.get<Model<PasswordResetTokenDocument>>(
      getModelToken(PasswordResetToken.name),
    );
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Setup mocks
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword123');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (crypto.randomUUID as jest.Mock).mockReturnValue('mock-uuid-123');
    (crypto.randomBytes as jest.Mock).mockReturnValue({
      toString: jest.fn().mockReturnValue('randomhexstring'),
    });
    (crypto.createHash as jest.Mock).mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('hashedToken'),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create (register)', () => {
    const createDto: CreateStudentDto = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      password: 'password123',
    };

    it('happy path — saves student, hashes password, emits event', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      const savedStudent = {
        ...mockStudent,
        email: createDto.email,
        id: 'new-id-123',
      };

      function MockStudentModel(dto: any) {
        Object.assign(this, dto);
        this.save = jest.fn().mockResolvedValue(savedStudent);
      }
      MockStudentModel.findOne = jest.fn().mockReturnValue(mockQuery(null));
      (service as any).studentModel = MockStudentModel;

      jest.spyOn(jwtService, 'sign').mockReturnValue('mock.access.token');

      const result = await service.create(createDto);

      expect(bcrypt.hash).toHaveBeenCalled();
      expect(result.user.email).toBe(createDto.email);
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('throws ConflictException for duplicate email', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(mockStudent) as any);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('calls bcrypt.hash with the plaintext password', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      const savedStudent = { ...mockStudent, id: 'new-id-456' };
      function MockStudentModel2(dto: any) {
        Object.assign(this, dto);
        this.save = jest.fn().mockResolvedValue(savedStudent);
      }
      MockStudentModel2.findOne = jest.fn().mockReturnValue(mockQuery(null));
      (service as any).studentModel = MockStudentModel2;

      jest.spyOn(jwtService, 'sign').mockReturnValue('mock.token');

      await service.create(createDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(
        createDto.password,
        expect.any(Number),
      );
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto: VerifyEmailDto = {
      token: 'valid.jwt.token',
    };

    it('should successfully verify email', async () => {
      const mockPayload = {
        sub: mockStudent.id,
        email: mockStudent.email,
        type: 'email_verification',
      };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(studentModel, 'findById').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: false,
          verificationAttempts: 0,
          lastVerificationAttempt: null,
          save: jest.fn().mockResolvedValue(true),
        }) as any,
      );

      const result = await service.verifyEmail(verifyEmailDto);

      expect(result.message).toBe('Email verified successfully');
    });

    it('should throw BadRequestException when token is missing', async () => {
      await expect(service.verifyEmail({ token: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for wrong token type', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockStudent.id,
        email: mockStudent.email,
        type: 'refresh',
      });

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when student not found', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'nonexistent',
        email: 'test@example.com',
        type: 'email_verification',
      });
      jest
        .spyOn(studentModel, 'findById')
        .mockReturnValue(mockQuery(null) as any);

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when email already verified', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockStudent.id,
        email: mockStudent.email,
        type: 'email_verification',
      });
      jest.spyOn(studentModel, 'findById').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: true,
        }) as any,
      );

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on verification cooldown', async () => {
      const now = Math.floor(Date.now() / 1000);
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockStudent.id,
        email: mockStudent.email,
        type: 'email_verification',
      });
      jest.spyOn(studentModel, 'findById').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: false,
          lastVerificationAttempt: now - 30,
          verificationAttempts: 1,
        }) as any,
      );

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when token email does not match student email', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockStudent.id,
        email: 'different@example.com',
        type: 'email_verification',
      });
      jest.spyOn(studentModel, 'findById').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: false,
        }) as any,
      );

      await expect(service.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerificationEmail', () => {
    const resendDto: ResendVerificationEmailDto = {
      email: 'john@example.com',
    };

    it('should resend verification email successfully', async () => {
      const mockStudentWithSave = {
        ...mockStudent,
        emailVerified: false,
        lastVerificationAttempt: null,
        save: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(mockStudentWithSave) as any);
      jest.spyOn(jwtService, 'sign').mockReturnValue('new.verification.token');

      const result = await service.resendVerificationEmail(resendDto);

      expect(result.message).toBe(
        'If the email exists, a verification link has been sent',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DomainEvents.VERIFICATION_EMAIL_RESENT,
        expect.any(StudentRegisteredPayload),
      );
    });

    it('should return success even when email not found (security)', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      const result = await service.resendVerificationEmail(resendDto);

      expect(result.message).toBe(
        'If the email exists, a verification link has been sent',
      );
    });

    it('should throw BadRequestException when email already verified', async () => {
      jest.spyOn(studentModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: true,
        }) as any,
      );

      await expect(service.resendVerificationEmail(resendDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on cooldown', async () => {
      const now = Math.floor(Date.now() / 1000);
      jest.spyOn(studentModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: false,
          lastVerificationAttempt: now - 30,
        }) as any,
      );

      await expect(service.resendVerificationEmail(resendDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginStudentDto = {
      email: 'john@example.com',
      password: 'password123',
    };

    it('should successfully login', async () => {
      jest.spyOn(studentModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: true,
        }) as any,
      );
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(true);
      jest.spyOn(service as any, 'generateTokenPair').mockResolvedValue({
        accessToken: 'access.token',
        refreshToken: 'refresh.token',
        expiresIn: 3600,
      });

      const result = await service.login(loginDto);

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw BadRequestException when email or password missing', async () => {
      await expect(service.login({ email: '', password: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException when student not found', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password invalid', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(mockStudent) as any);
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when email not verified', async () => {
      jest.spyOn(studentModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockStudent,
          emailVerified: false,
        }) as any,
      );
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when account is locked', async () => {
      jest.spyOn(studentModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockStudent,
          lockedUntil: new Date(Date.now() + 600000),
        }) as any,
      );

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('forgetPassword', () => {
    const forgetDto: ForgetPasswordDto = {
      email: 'john@example.com',
    };

    it('should return success even when email not found (security)', async () => {
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      const result = await service.forgetPassword(forgetDto);

      expect(result.message).toBe(
        'If the email exists, a reset link has been sent',
      );
      expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('should send password reset email when student exists', async () => {
      const studentWithSave = {
        ...mockStudent,
        save: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(studentModel, 'findOne')
        .mockReturnValue(mockQuery(studentWithSave) as any);
      jest
        .spyOn(passwordResetTokenModel, 'updateMany')
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(true) } as any);
      (crypto.randomBytes as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue('reset-token-hex'),
      });

      const result = await service.forgetPassword(forgetDto, '127.0.0.1', 'Mozilla');

      expect(result.message).toBe(
        'If the email exists, a reset link has been sent',
      );
      expect(emailService.sendPasswordReset).toHaveBeenCalled();
    });

    it('should throw BadRequestException when email is missing', async () => {
      await expect(
        service.forgetPassword({ email: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    const resetDto: ResetPasswordDto = {
      token: 'valid-reset-token',
      newPassword: 'newPassword123',
    };

    it('should reset password successfully', async () => {
      jest.spyOn(passwordResetTokenModel, 'findOne').mockReturnValue(
        mockQuery({
          ...mockPasswordResetToken,
          save: jest.fn().mockResolvedValue(true),
        }) as any,
      );
      jest
        .spyOn(studentModel, 'findById')
        .mockReturnValue(mockQuery(mockStudent) as any);
      jest.spyOn(refreshTokenModel, 'deleteMany').mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      } as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      const result = await service.resetPassword(
        resetDto,
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.message).toBe('Password reset successfully');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('should throw BadRequestException when token or password missing', async () => {
      await expect(
        service.resetPassword({ token: '', newPassword: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for short password', async () => {
      await expect(
        service.resetPassword({ token: 'valid', newPassword: '123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid or expired token', async () => {
      jest
        .spyOn(passwordResetTokenModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshToken', () => {
    const refreshDto: RefreshTokenDto = {
      refreshToken: 'valid.refresh.token',
    };

    it('should refresh token successfully', async () => {
      const mockPayload = { family: 'family-123' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest
        .spyOn(refreshTokenModel, 'findOne')
        .mockReturnValue(mockQuery(mockRefreshToken) as any);
      jest.spyOn(refreshTokenModel, 'deleteOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      } as any);
      jest
        .spyOn(studentModel, 'findById')
        .mockReturnValue(mockQuery(mockStudent) as any);
      jest.spyOn(service as any, 'generateTokenPair').mockResolvedValue({
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 3600,
      });

      const result = await service.refreshToken(refreshDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw BadRequestException when refresh token missing', async () => {
      await expect(service.refreshToken({ refreshToken: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token not found in DB', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ family: 'family-123' });
      jest
        .spyOn(refreshTokenModel, 'findOne')
        .mockReturnValue(mockQuery(null) as any);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke the entire family when a revoked token is used', async () => {
      const revokedToken = {
        ...mockRefreshToken,
        isRevoked: true,
      };
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ family: 'family-123' });
      jest
        .spyOn(refreshTokenModel, 'findOne')
        .mockReturnValue(mockQuery(revokedToken) as any);
      const updateManySpy = jest.spyOn(refreshTokenModel, 'updateMany').mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      } as any);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(updateManySpy).toHaveBeenCalledWith(
        { tokenFamily: 'family-123' },
        { isRevoked: true },
      );
    });

    it('should mark the token as revoked on a successful refresh', async () => {
      const validToken = {
        ...mockRefreshToken,
        isRevoked: false,
        save: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ family: 'family-123' });
      jest
        .spyOn(refreshTokenModel, 'findOne')
        .mockReturnValue(mockQuery(validToken) as any);
      jest
        .spyOn(studentModel, 'findById')
        .mockReturnValue(mockQuery(mockStudent) as any);
      jest.spyOn(service as any, 'generateTokenPair').mockResolvedValue({
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 3600,
      });

      await service.refreshToken(refreshDto);
      expect(validToken.isRevoked).toBe(true);
      expect(validToken.save).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const logoutDto: RefreshTokenDto = {
      refreshToken: 'valid.refresh.token',
    };

    it('should logout successfully', async () => {
      jest.spyOn(refreshTokenModel, 'deleteOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      } as any);

      const result = await service.logout(logoutDto);

      expect(result.message).toBe('Logged out successfully');
    });

    it('should throw BadRequestException when refresh token missing', async () => {
      await expect(service.logout({ refreshToken: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyJwt', () => {
    it('should verify JWT successfully', () => {
      const mockPayload = { sub: '123', email: 'test@example.com' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      const result = service.verifyJwt('valid.token');

      expect(result).toEqual(mockPayload);
    });

    it('should throw error when JWT verification fails', () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyJwt('invalid.token')).toThrow(Error);
    });
  });
});
