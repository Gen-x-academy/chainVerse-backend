import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import type { AuthTokenPayload, AuthTokens, AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly usersById = new Map<string, AuthUser>();
  private readonly usersByEmail = new Map<string, AuthUser>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signInWithGoogle(input: GoogleAuthDto) {
    const user = this.upsertGoogleUser(input);
    const tokens = await this.generateTokens(user);

    user.refreshTokenHash = this.hashToken(tokens.refreshToken);
    user.updatedAt = new Date();

    return this.buildAuthResponse(user, tokens);
  }

  async refreshTokens(input: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(input.refreshToken);
    const user = this.usersById.get(payload.sub);

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token is not recognized');
    }

    if (user.refreshTokenHash !== this.hashToken(input.refreshToken)) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    const tokens = await this.generateTokens(user);
    user.refreshTokenHash = this.hashToken(tokens.refreshToken);
    user.updatedAt = new Date();

    return this.buildAuthResponse(user, tokens);
  }

  async getCurrentUser(userId: string) {
    const user = this.usersById.get(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.serializeUser(user);
  }

  private upsertGoogleUser(input: GoogleAuthDto): AuthUser {
    const existingUser = this.usersByEmail.get(input.email.toLowerCase());

    if (existingUser) {
      existingUser.googleId = input.googleId;
      existingUser.name = input.name;
      existingUser.avatarUrl = input.avatarUrl;
      existingUser.updatedAt = new Date();
      this.usersByEmail.set(existingUser.email, existingUser);
      this.usersById.set(existingUser.id, existingUser);
      return existingUser;
    }

    const now = new Date();
    const newUser: AuthUser = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      googleId: input.googleId,
      name: input.name,
      avatarUrl: input.avatarUrl,
      createdAt: now,
      updatedAt: now,
    };

    this.usersByEmail.set(newUser.email, newUser);
    this.usersById.set(newUser.id, newUser);

    return newUser;
  }

  private async generateTokens(user: AuthUser): Promise<AuthTokens> {
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_SECRET',
          'development-only-secret',
        ),
        expiresIn: this.getJwtExpiry('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          this.configService.get<string>(
            'JWT_SECRET',
            'development-only-secret',
          ),
        ),
        expiresIn: this.getJwtExpiry(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async verifyRefreshToken(token: string): Promise<AuthTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          this.configService.get<string>(
            'JWT_SECRET',
            'development-only-secret',
          ),
        ),
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getJwtExpiry(key: string, fallback: string) {
    return this.configService.get<string>(key, fallback) as number | StringValue;
  }

  private buildAuthResponse(user: AuthUser, tokens: AuthTokens) {
    return {
      user: this.serializeUser(user),
      ...tokens,
    };
  }

  private serializeUser(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      googleId: user.googleId,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
