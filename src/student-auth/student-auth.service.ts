import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { DomainEvents } from '../events/event-names';
import { StudentRegisteredPayload } from '../events/payloads/student-registered.payload';
import { Student, StudentDocument } from './schemas/student.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';

const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;

@Injectable()
export class StudentAuthService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  constructor(private readonly eventEmitter: EventEmitter2) {}

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
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${sig}`;
  }

  static verifyJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
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

  private async generateTokenPair(student: StudentDocument) {
    const accessToken = this.createJwt(
      { sub: student.id, email: student.email, role: student.role },
      ACCESS_TOKEN_EXPIRY,
    );
    const refreshToken = this.createJwt(
      { sub: student.id, type: 'refresh' },
      REFRESH_TOKEN_EXPIRY,
    );
    await new this.refreshTokenModel({
      token: refreshToken,
      studentId: student.id,
      expiresAt: Date.now() + REFRESH_TOKEN_EXPIRY * 1000,
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

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const student = await new this.studentModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: this.hashPassword(dto.password),
      verificationToken,
    }).save();

    this.students.push(student);

    this.eventEmitter.emit(
      DomainEvents.STUDENT_REGISTERED,
      Object.assign(new StudentRegisteredPayload(), {
        studentId: student.id,
        email: student.email,
        firstName: student.firstName,
      }),
    );

    const tokens = this.generateTokenPair(student);
    const tokens = await this.generateTokenPair(student);

    return {
      message: 'Account created. Please verify your email.',
      user: this.sanitizeStudent(student),
      verificationToken,
      ...tokens,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    if (!dto.token) {
      throw new BadRequestException('Verification token is required');
    }

    const student = await this.studentModel
      .findOne({ verificationToken: dto.token })
      .exec();
    if (!student) {
      throw new NotFoundException('Invalid verification token');
    }

    student.emailVerified = true;
    student.verificationToken = null;
    await student.save();

    return { message: 'Email verified successfully' };
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

  async forgetPassword(dto: ForgetPasswordDto) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    const student = await this.studentModel
      .findOne({ email: dto.email })
      .exec();
    if (!student) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    student.resetToken = resetToken;
    student.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    await student.save();

    return {
      message: 'If the email exists, a reset link has been sent',
      resetToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || !dto.newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const student = await this.studentModel
      .findOne({
        resetToken: dto.token,
        resetTokenExpiry: { $gt: Date.now() },
      })
      .exec();

    if (!student) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    student.passwordHash = this.hashPassword(dto.newPassword);
    student.resetToken = null;
    student.resetTokenExpiry = null;
    await student.save();

    return { message: 'Password reset successfully' };
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const stored = await this.refreshTokenModel
      .findOne({ token: dto.refreshToken })
      .exec();
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    try {
      StudentAuthService.verifyJwt(dto.refreshToken);
    } catch {
      await this.refreshTokenModel.deleteOne({ token: dto.refreshToken }).exec();
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.refreshTokenModel.deleteOne({ token: dto.refreshToken }).exec();

    const student = await this.studentModel.findById(stored.studentId).exec();
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.generateTokenPair(student);
  }
}
