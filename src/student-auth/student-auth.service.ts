import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../email/email.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { DomainEvents } from '../events/event-names';
import { StudentRegisteredPayload } from '../events/payloads/student-registered.payload';
import { Student, StudentDocument } from './schemas/student.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';

const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;
const BCRYPT_SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_EXPIRY = 86400; // 24 hours
const RESET_TOKEN_EXPIRY = 900; // 15 minutes
const VERIFICATION_COOLDOWN = 60; // 1 minute cooldown between attempts
const VERIFICATION_ATTEMPT_WINDOW = 900; // 15 minutes window for attempt counting
const MAX_VERIFICATION_ATTEMPTS = 5; // Maximum 5 attempts per window

@Injectable()
export class StudentAuthService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetTokenDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  private async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, storedHash);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private createVerificationToken(studentId: string, email: string): string {
    return this.jwtService.sign(
      { sub: studentId, email, type: 'email_verification' },
      { expiresIn: VERIFICATION_TOKEN_EXPIRY },
    );
  }

  verifyJwt(token: string): Record<string, unknown> {
    try {
      return this.jwtService.verify<Record<string, unknown>>(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new Error(message);
    }
  }

  private async generateTokenPair(
    student: StudentDocument,
    tokenFamily?: string,
  ) {
    const family = tokenFamily ?? crypto.randomUUID();
    const accessToken = this.jwtService.sign(
      { sub: student.id, email: student.email, role: student.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
    const refreshToken = this.jwtService.sign(
      {
        sub: student.id,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'),
      },
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );
    await new this.refreshTokenModel({
      tokenHash: this.hashToken(refreshToken),
      tokenFamily: family,
      studentId: student.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
    }).save();
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
  }

  private sanitizeStudent(student: StudentDocument) {
    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      emailVerified: student.emailVerified,
      role: student.role,
      createdAt: student.createdAt,
    };
  }

  async create(dto: CreateStudentDto) {
    if (!dto.firstName || !dto.lastName || !dto.email || !dto.password) {
      throw new BadRequestException(
        'firstName, lastName, email, and password are required',
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.studentModel
      .findOne({ email: dto.email })
      .exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const student = await new this.studentModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
    }).save();

    const verificationToken = this.createVerificationToken(
      student.id,
      student.email,
    );

    student.verificationToken = verificationToken;
    student.verificationTokenExpiry =
      Date.now() + VERIFICATION_TOKEN_EXPIRY * 1000;
    await student.save();

    await this.emailService.sendVerificationEmail(
      student.email,
      verificationToken,
    );

    this.eventEmitter.emit(
      DomainEvents.STUDENT_REGISTERED,
      Object.assign(new StudentRegisteredPayload(), {
        studentId: student.id,
        email: student.email,
        firstName: student.firstName,
      }),
    );

    const tokens = await this.generateTokenPair(student);

    return {
      message: 'Account created. Please verify your email.',
      user: this.sanitizeStudent(student),
      ...tokens,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    if (!dto.token) {
      throw new BadRequestException('Verification token is required');
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.verifyJwt(dto.token);
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (payload.type !== 'email_verification') {
      throw new BadRequestException('Invalid verification token type');
    }

    const studentId = payload.sub as string;
    const email = payload.email as string;

    const student = await this.studentModel.findById(studentId).exec();
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.email !== email) {
      throw new BadRequestException('Token does not match student email');
    }

    if (student.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      student.lastVerificationAttempt &&
      now - student.lastVerificationAttempt < VERIFICATION_COOLDOWN
    ) {
      throw new BadRequestException(
        'Too many verification attempts. Please wait before trying again.',
      );
    }

    const attemptsInWindow =
      student.lastVerificationAttempt &&
      now - student.lastVerificationAttempt < VERIFICATION_ATTEMPT_WINDOW
        ? student.verificationAttempts
        : 0;

    if (attemptsInWindow >= MAX_VERIFICATION_ATTEMPTS) {
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new verification token.',
      );
    }

    student.verificationAttempts += 1;
    student.lastVerificationAttempt = now;
    await student.save();

    student.emailVerified = true;
    student.verificationToken = null;
    student.verificationTokenExpiry = null;
    student.verificationAttempts = 0;
    student.lastVerificationAttempt = null;
    await student.save();

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(dto: ResendVerificationEmailDto) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }

    const student = await this.studentModel
      .findOne({ email: dto.email })
      .exec();
    if (!student) {
      return {
        message: 'If the email exists, a verification link has been sent',
      };
    }

    if (student.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      student.lastVerificationAttempt &&
      now - student.lastVerificationAttempt < VERIFICATION_COOLDOWN
    ) {
      throw new BadRequestException(
        'Please wait before requesting another verification email.',
      );
    }

    const verificationToken = this.createVerificationToken(
      student.id,
      student.email,
    );

    student.verificationToken = verificationToken;
    student.verificationTokenExpiry =
      Date.now() + VERIFICATION_TOKEN_EXPIRY * 1000;
    student.verificationAttempts = 0;
    student.lastVerificationAttempt = now;
    await student.save();

    this.eventEmitter.emit(
      DomainEvents.VERIFICATION_EMAIL_RESENT,
      Object.assign(new StudentRegisteredPayload(), {
        studentId: student.id,
        email: student.email,
        firstName: student.firstName,
      }),
    );

    return {
      message: 'If the email exists, a verification link has been sent',
    };
  }

  async login(dto: LoginStudentDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const student = await this.studentModel
      .findOne({ email: dto.email })
      .exec();
    if (!student) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (student.lockedUntil && student.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const passwordValid = await this.verifyPassword(
      dto.password,
      student.passwordHash,
    );
    if (!passwordValid) {
      student.loginAttempts += 1;
      if (student.loginAttempts >= 5) {
        student.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await student.save();
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!student.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in.',
      );
    }

    student.loginAttempts = 0;
    student.lockedUntil = null;
    await student.save();

    const tokens = await this.generateTokenPair(student);

    return {
      user: this.sanitizeStudent(student),
      ...tokens,
    };
  }

  async forgetPassword(
    dto: ForgetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    const student = await this.studentModel
      .findOne({ email: dto.email })
      .exec();
    if (!student) {
      // Return success even if email doesn't exist to prevent email enumeration
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Invalidate any existing reset tokens for this student
    await this.passwordResetTokenModel
      .updateMany(
        { studentId: student.id },
        { $set: { used: true, usedAt: new Date() } },
      )
      .exec();

    // Generate a new secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY * 1000);

    // Persist the hashed token
    await new this.passwordResetTokenModel({
      tokenHash,
      studentId: student.id,
      expiresAt,
      ipAddress,
      userAgent,
    }).save();

    // Also update student record for backward compatibility (will be removed later)
    student.resetToken = tokenHash;
    student.resetTokenExpiry = expiresAt.getTime();
    await student.save();

    // Send password reset email (token must only travel to user's inbox)
    const baseUrl =
      this.configService.get<string>('baseUrl') ?? 'http://localhost:3000';
    await this.emailService.sendPasswordReset(
      student.email,
      resetToken,
      baseUrl,
    );

    // Do NOT return the token in the response (security)
    return {
      message: 'If the email exists, a reset link has been sent',
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!dto.token || !dto.newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = this.hashToken(dto.token);

    // Find the reset token record
    const resetTokenRecord = await this.passwordResetTokenModel
      .findOne({
        tokenHash,
        used: false,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (!resetTokenRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const student = await this.studentModel
      .findById(resetTokenRecord.studentId)
      .exec();
    if (!student) throw new NotFoundException('Student not found');

    const passwordHash = await this.hashPassword(dto.newPassword);
    student.passwordHash = passwordHash;
    student.resetToken = null;
    student.resetTokenExpiry = null;
    await student.save();

    // Mark the reset token as used (one-time use enforcement)
    resetTokenRecord.used = true;
    resetTokenRecord.usedAt = new Date();
    if (ipAddress) {
      resetTokenRecord.ipAddress = ipAddress;
    }
    if (userAgent) {
      resetTokenRecord.userAgent = userAgent;
    }
    await resetTokenRecord.save();

    // Invalidate all active sessions after password reset (security measure)
    await this.refreshTokenModel.deleteMany({ studentId: student.id }).exec();

    // Emit password reset event for audit/logging
    this.eventEmitter.emit('password.reset', {
      studentId: student.id,
      email: student.email,
      resetAt: new Date(),
      ipAddress,
    });

    return { message: 'Password reset successfully' };
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    // Verify JWT signature and expiry first to extract the token family claim
    let payload: Record<string, unknown>;
    try {
      payload = this.verifyJwt(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored) {
      throw new UnauthorizedException(
        'Refresh token has been revoked or already used',
      );
    }

    if (stored.isRevoked) {
      // Token is already revoked: revoke ALL tokens in the family (theft detected)
      await this.refreshTokenModel
        .updateMany({ tokenFamily: stored.tokenFamily }, { isRevoked: true })
        .exec();
      throw new UnauthorizedException(
        'Refresh token has been revoked or already used',
      );
    }

    // Mark old token revoked
    stored.isRevoked = true;
    await stored.save();

    const student = await this.studentModel.findById(stored.studentId).exec();
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.generateTokenPair(student, stored.tokenFamily);
  }

  async logout(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    await this.refreshTokenModel.deleteOne({ tokenHash }).exec();

    return { message: 'Logged out successfully' };
  }
}
