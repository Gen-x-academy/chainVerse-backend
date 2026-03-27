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
import * as bcrypt from 'bcryptjs';
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
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class StudentAuthService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  private get jwtSecret(): string {
    return this.configService.get<string>('jwtSecret') ?? '';
  }

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

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const passwordHash = await this.hashPassword(dto.password);

    const student = await new this.studentModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      verificationToken,
    }).save();

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

    const passwordValid = await this.verifyPassword(
      dto.password,
      student.passwordHash,
    );
    if (!passwordValid) {
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

    // In production, send email with reset link containing the token
    // For now, log it (in real implementation, this would be sent via email service)
    console.log(`[Password Reset] Token for ${student.email}: ${resetToken}`);

    // Do NOT return the token in the response (security)
    return {
      message: 'If the email exists, a reset link has been sent',
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

    const passwordHash = await this.hashPassword(dto.newPassword);
    student.passwordHash = passwordHash;
    student.resetToken = null;
    student.resetTokenExpiry = null;
    await student.save();

    // Invalidate all active sessions after password reset
    await this.refreshTokenModel.deleteMany({ studentId: student.id }).exec();

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
