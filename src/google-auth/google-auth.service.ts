import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleUser, GoogleUserDocument } from './schemas/google-user.schema';

const ACCESS_TOKEN_EXPIRY = 3600;

@Injectable()
export class GoogleAuthService {
  constructor(
    @InjectModel(GoogleUser.name)
    private readonly googleUserModel: Model<GoogleUserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  private generateAccessToken(user: GoogleUserDocument): string {
  private createAccessToken(user: GoogleUserDocument): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
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

    return {
      accessToken: this.generateAccessToken(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
    const accessToken = this.createAccessToken(user);

    return { accessToken, expiresIn: ACCESS_TOKEN_EXPIRY };
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

    return {
      accessToken: this.generateAccessToken(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
    const accessToken = this.createAccessToken(user);

    return { accessToken, expiresIn: ACCESS_TOKEN_EXPIRY };
  }
}
