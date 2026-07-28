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
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { redactMetadata } from '../common/audit/audit-redaction';
import { CreateAdminDto } from './dto/create-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Admin, AdminDocument } from './schemas/admin.schema';
import {
  AdminRefreshToken,
  AdminRefreshTokenDocument,
} from './schemas/admin-refresh-token.schema';

const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour (short-lived access token)
const REFRESH_TOKEN_EXPIRY = 604800; // 7 days (rotating refresh token)
const BCRYPT_SALT_ROUNDS = 10;
const TARGET_TYPE = 'admin_account';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    @InjectModel(AdminRefreshToken.name)
    private readonly refreshTokenModel: Model<AdminRefreshTokenDocument>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
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

  verifyJwt(token: string): Record<string, unknown> {
    try {
      return this.jwtService.verify<Record<string, unknown>>(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new Error(message);
    }
  }

  private async generateTokenPair(
    admin: AdminDocument,
    tokenFamily?: string,
  ) {
    const family = tokenFamily ?? crypto.randomUUID();
    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
    const refreshToken = this.jwtService.sign(
      {
        sub: admin.id,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'),
      },
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );
    await new this.refreshTokenModel({
      tokenHash: this.hashToken(refreshToken),
      tokenFamily: family,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
    }).save();
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRY };
  }

  private sanitizeAdmin(admin: AdminDocument) {
    return {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    };
  }

  async findAll() {
    const admins = await this.adminModel.find().exec();
    return admins.map(admin => this.sanitizeAdmin(admin));
  }

  async findOne(id: string) {
    const admin = await this.adminModel.findById(id).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return this.sanitizeAdmin(admin);
  }

  async create(payload: CreateAdminDto, audit?: AuditContext) {
    if (!payload.firstName || !payload.lastName || !payload.email || !payload.password) {
      throw new BadRequestException(
        'firstName, lastName, email, and password are required',
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (payload.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.adminModel
      .findOne({ email: payload.email })
      .exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashPassword(payload.password);

    const admin = await new this.adminModel({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      passwordHash,
    }).save();

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_CREATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id: admin.id },
      before: null,
      after: redactMetadata({ ...this.sanitizeAdmin(admin) }),
    });

    return this.sanitizeAdmin(admin);
  }

  async login(dto: LoginAdminDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const admin = await this.adminModel
      .findOne({ email: dto.email })
      .exec();
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is disabled');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked. Try again later.',
      );
    }

    const passwordValid = await this.verifyPassword(
      dto.password,
      admin.passwordHash,
    );
    if (!passwordValid) {
      admin.loginAttempts += 1;
      if (admin.loginAttempts >= 5) {
        admin.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await admin.save();
      throw new UnauthorizedException('Invalid email or password');
    }

    admin.loginAttempts = 0;
    admin.lockedUntil = null;
    await admin.save();

    const tokens = await this.generateTokenPair(admin);

    return {
      user: this.sanitizeAdmin(admin),
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

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
      await this.refreshTokenModel
        .updateMany({ tokenFamily: stored.tokenFamily }, { isRevoked: true })
        .exec();
      throw new UnauthorizedException(
        'Refresh token has been revoked or already used',
      );
    }

    stored.isRevoked = true;
    await stored.save();

    const admin = await this.adminModel.findById(stored.adminId).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is disabled');
    }

    return this.generateTokenPair(admin, stored.tokenFamily);
  }

  async logout(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    await this.refreshTokenModel.deleteOne({ tokenHash }).exec();

    return { message: 'Logged out successfully' };
  }

  async getProfile(adminId: string) {
    const admin = await this.adminModel.findById(adminId).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return this.sanitizeAdmin(admin);
  }

  async update(id: string, payload: UpdateAdminDto, audit?: AuditContext) {
    const admin = await this.adminModel.findById(id).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const before = redactMetadata({ ...this.sanitizeAdmin(admin) });

    if (payload.password) {
      payload.passwordHash = await this.hashPassword(payload.password);
      delete payload.password;
    }

    Object.assign(admin, payload);
    await admin.save();

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_UPDATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: redactMetadata({ ...this.sanitizeAdmin(admin) }),
    });

    return this.sanitizeAdmin(admin);
  }

  async remove(id: string, audit?: AuditContext) {
    const admin = await this.adminModel.findById(id).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const before = redactMetadata({ ...this.sanitizeAdmin(admin) });

    await this.adminModel.findByIdAndDelete(id).exec();
    await this.refreshTokenModel.deleteMany({ adminId: id }).exec();

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_DELETED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: null,
    });

    return { id, deleted: true };
  }
}