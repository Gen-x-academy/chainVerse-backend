import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  verificationToken: string | null;
  resetToken: string | null;
  resetTokenExpiry: number | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;

@Injectable()
export class StudentAuthService {
  private readonly students: Student[] = [];
  private readonly refreshTokens = new Map<string, string>();

  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    const verify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verify;
  }

  private createJwt(payload: Record<string, any>, expiresIn: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
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

  static verifyJwt(token: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (sig !== expected) throw new Error('Invalid token signature');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    return payload;
  }

  private generateTokenPair(student: Student) {
    const accessToken = this.createJwt(
      { sub: student.id, email: student.email, role: student.role },
      ACCESS_TOKEN_EXPIRY,
    );
    const refreshToken = this.createJwt(
      { sub: student.id, type: 'refresh' },
      REFRESH_TOKEN_EXPIRY,
    );
    this.refreshTokens.set(refreshToken, student.id);
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
  }

  private sanitizeStudent(student: Student) {
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

  create(dto: CreateStudentDto) {
    if (!dto.firstName || !dto.lastName || !dto.email || !dto.password) {
      throw new BadRequestException('firstName, lastName, email, and password are required');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = this.students.find((s) => s.email === dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const student: Student = {
      id: crypto.randomUUID(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: this.hashPassword(dto.password),
      emailVerified: false,
      verificationToken,
      resetToken: null,
      resetTokenExpiry: null,
      role: 'student',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.students.push(student);
    const tokens = this.generateTokenPair(student);

    return {
      message: 'Account created. Please verify your email.',
      user: this.sanitizeStudent(student),
      verificationToken,
      ...tokens,
    };
  }

  verifyEmail(dto: VerifyEmailDto) {
    if (!dto.token) {
      throw new BadRequestException('Verification token is required');
    }

    const student = this.students.find((s) => s.verificationToken === dto.token);
    if (!student) {
      throw new NotFoundException('Invalid verification token');
    }

    student.emailVerified = true;
    student.verificationToken = null;
    student.updatedAt = new Date();

    return { message: 'Email verified successfully' };
  }

  login(dto: LoginStudentDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const student = this.students.find((s) => s.email === dto.email);
    if (!student) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!this.verifyPassword(dto.password, student.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!student.emailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    student.updatedAt = new Date();
    const tokens = this.generateTokenPair(student);

    return {
      user: this.sanitizeStudent(student),
      ...tokens,
    };
  }

  forgetPassword(dto: ForgetPasswordDto) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    const student = this.students.find((s) => s.email === dto.email);
    if (!student) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    student.resetToken = resetToken;
    student.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    student.updatedAt = new Date();

    return {
      message: 'If the email exists, a reset link has been sent',
      resetToken,
    };
  }

  resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || !dto.newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const student = this.students.find(
      (s) => s.resetToken === dto.token && s.resetTokenExpiry && s.resetTokenExpiry > Date.now(),
    );

    if (!student) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    student.passwordHash = this.hashPassword(dto.newPassword);
    student.resetToken = null;
    student.resetTokenExpiry = null;
    student.updatedAt = new Date();

    return { message: 'Password reset successfully' };
  }

  refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const studentId = this.refreshTokens.get(dto.refreshToken);
    if (!studentId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    try {
      StudentAuthService.verifyJwt(dto.refreshToken);
    } catch {
      this.refreshTokens.delete(dto.refreshToken);
      throw new UnauthorizedException('Refresh token expired');
    }

    this.refreshTokens.delete(dto.refreshToken);

    const student = this.students.find((s) => s.id === studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const tokens = this.generateTokenPair(student);
    return tokens;
  }
}
