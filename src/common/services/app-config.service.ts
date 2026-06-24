import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed wrapper around ConfigService for application-level config values.
 * Centralises env access so callers never touch process.env directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('PORT') ?? 3000;
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) throw new Error('DATABASE_URL is not set');
    return url;
  }

  get jwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not set');
    return secret;
  }

  get jwtRefreshSecret(): string {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
    return secret;
  }

  get allowedOrigins(): string[] {
    const raw = this.config.get<string>('ALLOWED_ORIGINS') ?? 'http://localhost:3000';
    return raw.split(',').map((o) => o.trim());
  }
}
