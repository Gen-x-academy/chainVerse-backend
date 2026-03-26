import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleUser, GoogleUserDocument } from './schemas/google-user.schema';
import * as crypto from 'crypto';

@Injectable()
export class GoogleAuthService {
  constructor(
    @InjectModel(GoogleUser.name)
    private readonly googleUserModel: Model<GoogleUserDocument>,
  ) {}

  async register(
    payload: GoogleAuthDto,
  ): Promise<{ user: GoogleUser; token: string }> {
    const existing = await this.googleUserModel
      .findOne({
        $or: [{ googleId: payload.googleId }, { email: payload.email }],
      })
      .exec();
    if (existing) {
      throw new ConflictException('User already registered');
    }

    const user = await new this.googleUserModel(payload).save();

    return {
      user,
      token: 'mock-jwt-token-' + crypto.randomUUID(),
    };
  }

  async login(
    payload: GoogleAuthDto,
  ): Promise<{ user: GoogleUser; token: string }> {
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

    return {
      user,
      token: 'mock-jwt-token-' + crypto.randomUUID(),
    };
  }
}
