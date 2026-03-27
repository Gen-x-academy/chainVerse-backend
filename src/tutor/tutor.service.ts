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
import { CreateTutorDto } from './dto/create-tutor.dto';
import { LoginTutorDto } from './dto/login-tutor.dto';
import { VerifyTutorEmailDto } from './dto/verify-tutor-email.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { Tutor, TutorDocument } from './schemas/tutor.schema';

const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;
const VERIFICATION_TOKEN_EXPIRY = 86400; // 24 hours

@Injectable()
export class TutorService {
  constructor(
    @InjectModel(Tutor.name)
    private readonly tutorModel: Model<TutorDocument>,
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

  private createVerificationToken(tutorId: string, email: string): string {
    return this.createJwt(
      { sub: tutorId, email, type: 'email_verification' },
      VERIFICATION_TOKEN_EXPIRY,
    );
  }

  private async generateTokenPair(tutor: TutorDocument) {
    const family = crypto.randomUUID();
    const accessToken = this.createJwt(
      { sub: tutor.id, email: tutor.email, role: tutor.role },
      ACCESS_TOKEN_EXPIRY,
    );
    const refreshToken = this.createJwt(
      { sub: tutor.id, type: 'refresh', jti: crypto.randomBytes(16).toString('hex') },
      REFRESH_TOKEN_EXPIRY,
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
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

    const existing = await this.tutorModel
      .findOne({ email: dto.email })
      .exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const tutor = await new this.tutorModel({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: this.hashPassword(dto.password),
    }).save();

    const verificationToken = this.createVerificationToken(
      tutor.id,
      tutor.email,
    );

    tutor.verificationToken = verificationToken;
    tutor.verificationTokenExpiry = Date.now() + VERIFICATION_TOKEN_EXPIRY * 1000;
    await tutor.save();

    return {
      message: 'Account created. Please verify your email.',
      user: this.sanitizeTutor(tutor),
      ...await this.generateTokenPair(tutor),
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

    const tutor = await this.tutorModel
      .findOne({ email: dto.email })
      .exec();
    if (!tutor) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!this.verifyPassword(dto.password, tutor.passwordHash)) {
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
