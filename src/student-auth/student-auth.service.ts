import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
const VERIFICATION_TOKEN_EXPIRY = 86400; // 24 hours
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_ATTEMPT_WINDOW = 3600; // 1 hour in seconds
const VERIFICATION_COOLDOWN = 300; // 5 minutes in seconds
const RESET_TOKEN_EXPIRY = 900; // 15 minutes in seconds

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
  ) {}

  private get jwtSecret(): string {
    return this.configService.get<string>('jwtSecret') ?? '';
  }

  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
      .toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    const verify = crypto
      .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
      .toString('hex');
    return hash === verify;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private createJwt(
    payload: Record<string, unknown>,
    expiresIn: number,
  ): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }),
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${sig}`;
  }

  private createVerificationToken(studentId: string, email: string): string {
    return this.createJwt(
      { sub: studentId, email, type: 'email_verification' },
      VERIFICATION_TOKEN_EXPIRY,
    );
  }

  verifyJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (sig !== expected) throw new Error('Invalid token signature');
    const decoded = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as Record<string, unknown>;
    if ((decoded.exp as number) < Math.floor(Date.now() / 1000))
      throw new Error('Token expired');
    return decoded;
  }

  private async generateTokenPair(
    student: StudentDocument,
    tokenFamily?: string,
  ) {
    const family = tokenFamily ?? crypto.randomUUID();
    const accessToken = this.createJwt(
      { sub: student.id, email: student.email, role: student.role },
      ACCESS_TOKEN_EXPIRY,
    );
    const refreshToken = this.createJwt(
      {
        sub: student.id,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'),
      },
      REFRESH_TOKEN_EXPIRY,
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

    const student = await new this.studentModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: this.hashPassword(dto.password),
    }).save();

    const verificationToken = this.createVerificationToken(
      student.id,
      student.email,
    );

    student.verificationToken = verificationToken;
    student.verificationTokenExpiry =
      Date.now() + VERIFICATION_TOKEN_EXPIRY * 1000;
    await student.save();

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

    if (attemptsInWindow + 1 > MAX_VERIFICATION_ATTEMPTS) {
      student.verificationToken = null;
      student.verificationTokenExpiry = null;
      await student.save();
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new verification token.',
      );
    }

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
      DomainEvents.STUDENT_REGISTERED,
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

    if (!this.verifyPassword(dto.password, student.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!student.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

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

    // In production, send email with reset link containing the token
    // For now, log it (in real implementation, this would be sent via email service)
    console.log(`[Password Reset] Token for ${student.email}: ${resetToken}`);

    // Return success without leaking the token
    return { message: 'If the email exists, a reset link has been sent' };
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

    // Get the student
    const student = await this.studentModel
      .findById(resetTokenRecord.studentId)
      .exec();

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Update password securely
    student.passwordHash = this.hashPassword(dto.newPassword);
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
      this.verifyJwt(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored) {
      // Token not in DB — possible replay of an already-rotated token.
      // Revoke the entire token family to invalidate any sessions derived from it.
      const family = payload.family as string | undefined;
      if (family) {
        await this.refreshTokenModel.deleteMany({ tokenFamily: family }).exec();
      }
      throw new UnauthorizedException(
        'Refresh token has been revoked or already used',
      );
    }

    // Rotate: delete consumed token, issue new pair in the same family
    await this.refreshTokenModel.deleteOne({ tokenHash }).exec();

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
