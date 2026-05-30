import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../email/email.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { LoginTutorDto } from './dto/login-tutor.dto';
import { VerifyTutorEmailDto } from './dto/verify-tutor-email.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { ForgetTutorPasswordDto } from './dto/forget-tutor-password.dto';
import { ResetTutorPasswordDto } from './dto/reset-tutor-password.dto';
import { Tutor, TutorDocument } from './schemas/tutor.schema';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';

const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;
const VERIFICATION_TOKEN_EXPIRY = 86400; // 24 hours
const RESET_TOKEN_EXPIRY = 900; // 15 minutes in seconds
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class TutorService {
  constructor(
    @InjectModel(Tutor.name)
    private readonly tutorModel: Model<TutorDocument>,
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

  private createVerificationToken(tutorId: string, email: string): string {
    return this.jwtService.sign(
      { sub: tutorId, email, type: 'email_verification' },
      { expiresIn: VERIFICATION_TOKEN_EXPIRY },
    );
  }

  private async generateTokenPair(tutor: TutorDocument) {
    const accessToken = this.jwtService.sign(
      { sub: tutor.id, email: tutor.email, role: tutor.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
    const refreshToken = this.jwtService.sign(
      {
        sub: tutor.id,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'),
      },
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
  }

  verifyJwt(token: string): Record<string, unknown> {
    try {
      return this.jwtService.verify<Record<string, unknown>>(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new Error(message);
    }
  }

  private sanitizeTutor(tutor: TutorDocument) {
    return {
      id: tutor.id,
      firstName: tutor.firstName,
      lastName: tutor.lastName,
      email: tutor.email,
      emailVerified: tutor.emailVerified,
      role: tutor.role,
      bio: tutor.bio,
      profileImageUrl: tutor.profileImageUrl,
      specializations: tutor.specializations,
      qualifications: tutor.qualifications,
      yearsOfExperience: tutor.yearsOfExperience,
      linkedinUrl: tutor.linkedinUrl,
      websiteUrl: tutor.websiteUrl,
      accountStatus: tutor.accountStatus,
      totalCourses: tutor.totalCourses,
      totalStudents: tutor.totalStudents,
      averageRating: tutor.averageRating,
      totalReviews: tutor.totalReviews,
      createdAt: tutor.createdAt,
    };
  }

  async create(dto: CreateTutorDto) {
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

    const existing = await this.tutorModel.findOne({ email: dto.email }).exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const tutor = await new this.tutorModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: await this.hashPassword(dto.password),
    }).save();

    const verificationToken = this.createVerificationToken(
      tutor.id,
      tutor.email,
    );

    tutor.verificationToken = verificationToken;
    tutor.verificationTokenExpiry =
      Date.now() + VERIFICATION_TOKEN_EXPIRY * 1000;
    await tutor.save();

    await this.emailService.sendVerificationEmail(
      tutor.email,
      verificationToken,
    );

    return {
      message: 'Account created. Please verify your email.',
      user: this.sanitizeTutor(tutor),
      ...(await this.generateTokenPair(tutor)),
    };
  }

  async verifyEmail(dto: VerifyTutorEmailDto) {
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

    const tutorId = payload.sub as string;
    const email = payload.email as string;

    const tutor = await this.tutorModel.findById(tutorId).exec();
    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    if (tutor.email !== email) {
      throw new BadRequestException('Token does not match tutor email');
    }

    if (tutor.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    tutor.emailVerified = true;
    tutor.verificationToken = null;
    tutor.verificationTokenExpiry = null;
    await tutor.save();

    return { message: 'Email verified successfully' };
  }

  async login(dto: LoginTutorDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const tutor = await this.tutorModel.findOne({ email: dto.email }).exec();
    if (!tutor) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!(await this.verifyPassword(dto.password, tutor.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!tutor.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    if (tutor.accountStatus !== 'active') {
      throw new UnauthorizedException(
        'Your account is not active. Please contact support.',
      );
    }

    const tokens = await this.generateTokenPair(tutor);

    return {
      user: this.sanitizeTutor(tutor),
      ...tokens,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async forgetPassword(
    dto: ForgetTutorPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    const tutor = await this.tutorModel.findOne({ email: dto.email }).exec();
    if (!tutor) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Invalidate any existing reset tokens for this tutor
    await this.passwordResetTokenModel
      .updateMany(
        { tutorId: tutor.id },
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
      tutorId: tutor.id,
      expiresAt,
      ipAddress,
      userAgent,
    }).save();

    // Also update tutor record for backward compatibility
    tutor.resetToken = tokenHash;
    tutor.resetTokenExpiry = expiresAt.getTime();
    await tutor.save();

    // Send password reset email (token must only travel to user's inbox)
    const baseUrl =
      this.configService.get<string>('baseUrl') ?? 'http://localhost:3000';
    await this.emailService.sendPasswordReset(tutor.email, resetToken, baseUrl);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(
    dto: ResetTutorPasswordDto,
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

    // Get the tutor
    const tutor = await this.tutorModel
      .findById(resetTokenRecord.tutorId)
      .exec();

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Update password securely
    tutor.passwordHash = await this.hashPassword(dto.newPassword);
    tutor.resetToken = null;
    tutor.resetTokenExpiry = null;
    await tutor.save();

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

    // Emit password reset event for audit/logging
    this.eventEmitter.emit('password.reset', {
      tutorId: tutor.id,
      email: tutor.email,
      resetAt: new Date(),
      ipAddress,
    });

    return { message: 'Password reset successfully' };
  }

  async getProfile(tutorId: string) {
    const tutor = await this.tutorModel.findById(tutorId).exec();
    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }
    return this.sanitizeTutor(tutor);
  }

  async updateProfile(tutorId: string, dto: UpdateTutorProfileDto) {
    const tutor = await this.tutorModel.findById(tutorId).exec();
    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    Object.assign(tutor, dto);
    await tutor.save();

    return this.sanitizeTutor(tutor);
  }
}
