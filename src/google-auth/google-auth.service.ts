import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleUser, GoogleUserDocument } from './schemas/google-user.schema';
import { StudentAuthService } from '../student-auth/student-auth.service';

const ACCESS_TOKEN_EXPIRY = 3600;

@Injectable()
export class GoogleAuthService {
  constructor(
    @InjectModel(GoogleUser.name)
    private readonly googleUserModel: Model<GoogleUserDocument>,
    private readonly configService: ConfigService,
    private readonly authService: StudentAuthService,
  ) {}

  private get jwtSecret(): string {
    return this.configService.get<string>('jwtSecret') ?? '';
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

  async register(
    payload: GoogleAuthDto,
  ): Promise<any> {
    const existing = await this.googleUserModel
      .findOne({
        $or: [{ googleId: payload.googleId }, { email: payload.email }],
      })
      .exec();
    if (existing) {
      throw new ConflictException('User already registered');
    }

    const user = await new this.googleUserModel(payload).save();

    return this.authService.generateTokenPair(user.id, user.email, user.role);
  }

  async login(
    payload: GoogleAuthDto,
  ): Promise<any> {
    const user = await this.googleUserModel
      .findOneAndUpdate(
        { googleId: payload.googleId },
        { $set: {} },
        { new: true },
      )
      .exec();
    if (!user) {
      throw new NotFoundException('User not found. Please register first.');
    }

    return this.authService.generateTokenPair(user.id, user.email, user.role);
  }
}
